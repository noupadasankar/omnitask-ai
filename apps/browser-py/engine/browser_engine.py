"""BrowserEngine — main orchestrator combining all engine modules.

Provides a single high-level API for any domain automation task:
    engine = BrowserEngine(page, ai_client=ai)
    await engine.execute_step(step, data)
    await engine.execute_workflow(plan, data)
"""

import asyncio
import logging
import time
import uuid
from typing import Optional, Callable, Any

from .action_executor import ActionExecutor, ActionResult, RiskLevel
from .audit_trail import AuditTrail
from .context_memory import BrowserContextMemory
from .decision_log import AIDecisionLog
from .dom_tracker import DOMTracker
from .element_resolver import ElementResolver
from .error_recovery import ErrorRecovery
from .form_filler import FormFiller
from .health import HealthChecker, GracefulShutdown, VersionInfo
from .login_manager import LoginManager
from .metrics import EngineMetrics
from .network_monitor import NetworkMonitor
from .popup_handler import PopupHandler
from .scroll_engine import ScrollEngine
from .security import SecurityManager
from .semantic_page import SemanticPage
from .smart_waiter import SmartWaiter
from .task_manager import TaskManager
from .verifier import Verifier, ComprehensiveVerification
from .vision_engine import VisionEngine
from .workflow_planner import WorkflowPlanner, WorkflowPlan
from .workflow_state import WorkflowStateManager, WorkflowState
from .config import get_config, EngineConfig
from .fixture_capture import FixtureCapturer, FixtureBundle
from .fixture_store import FixtureStore

log = logging.getLogger("browser-py.engine.browser_engine")


class BrowserEngine:
    """
    Unified browser automation engine for OmniTask AI.

    Usage:
        engine = BrowserEngine(page, ai_client=ai_client)
        result = await engine.execute_step({
            "action_type": "click",
            "instruction": "Click the Apply button",
            "input": {"selector": "[data-testid='apply-btn']"},
        })

        # Or a full workflow
        state = await engine.execute_workflow(
            task_id="task-123",
            user_id="user-abc",
            goal="Apply to 5 backend jobs on LinkedIn",
            domain="job",
            steps=[...],
            data={"name": "Alice", "location": "Remote"},
        )
    """

    def __init__(
        self,
        page,
        *,
        ai_client=None,
        approval_callback: Optional[Callable] = None,
        on_event: Optional[Callable] = None,
        config: Optional[EngineConfig] = None,
    ):
        """
        page: Playwright Page object.
        ai_client: AIClient instance (ai.py). Optional — degrades gracefully.
        approval_callback: async fn(action_type, description, risk) -> bool.
        on_event: async fn(event_type, payload) — called on significant events.
        config: EngineConfig. Defaults to get_config() (env-based singleton).
        """
        self.page = page
        self._on_event = on_event
        self.config = config or get_config()

        # Original 13 subsystems
        self.audit = AuditTrail(session_id=str(uuid.uuid4()))
        self.resolver = ElementResolver()
        self.filler = FormFiller()
        self.scroller = ScrollEngine()
        self.popups = PopupHandler()
        self.semantic = SemanticPage()
        self.verifier = Verifier()
        self.recovery = ErrorRecovery(
            max_attempts=self.config.recovery.get("max_recoveries", 2)
        )
        self.state_manager = WorkflowStateManager()
        self.vision = VisionEngine(ai_client)
        self.executor = ActionExecutor(approval_callback, self.audit)
        self.login = LoginManager()

        # New Phase 2 subsystems
        self.context_memory = BrowserContextMemory()
        self.network_monitor = NetworkMonitor()
        self.smart_waiter = SmartWaiter()
        self.dom_tracker = DOMTracker()
        self.workflow_planner = WorkflowPlanner()
        self.task_manager = TaskManager(
            max_concurrent=self.config.features.get("parallel_contexts", False) and 3 or 1
        )
        self.metrics = EngineMetrics.instance()
        self.security = SecurityManager()
        self.decision_log = AIDecisionLog()
        self.health_checker = HealthChecker()
        self.shutdown_handler = GracefulShutdown()

        # Register cleanup on shutdown
        self.shutdown_handler.register_cleanup(self._cleanup)

    # ── Monitoring lifecycle ──────────────────────────────────────────────────

    async def start_monitoring(self) -> None:
        """Attach all monitoring subsystems to the live page."""
        if self.config.features.get("network_monitoring", True):
            self.network_monitor.attach(self.page)
        if self.config.features.get("dom_tracking", True):
            await self.dom_tracker.start_tracking(self.page)
        await self.context_memory.full_update(self.page)
        log.debug("BrowserEngine: monitoring started")

    async def stop_monitoring(self) -> None:
        """Detach all monitoring subsystems."""
        if self.config.features.get("network_monitoring", True):
            self.network_monitor.detach(self.page)
        if self.config.features.get("dom_tracking", True):
            await self.dom_tracker.stop_tracking(self.page)
        log.debug("BrowserEngine: monitoring stopped")

    # ── High-level workflow execution ─────────────────────────────────────────

    async def execute_workflow(
        self,
        task_id: str,
        user_id: str,
        goal: str,
        domain: str,
        steps: list,
        data: dict = {},
        *,
        workflow_id: str = "",
    ) -> WorkflowState:
        """Execute a full multi-step workflow plan."""
        wf_id = workflow_id or str(uuid.uuid4())
        state = self.state_manager.create(wf_id, task_id, user_id, goal, domain, steps)
        t0 = time.time()
        self.metrics.record_task_start(task_id, domain)

        await self._emit("workflow:started", {
            "workflow_id": wf_id, "goal": goal, "domain": domain,
            "total_steps": len(steps),
        })

        # Initial page analysis and monitoring
        await self.start_monitoring()
        await self.popups.dismiss_all(self.page)
        page_summary = await self.semantic.analyze(self.page)
        log.info("Workflow %s starting — page: %s, auth: %s", wf_id, page_summary.page_purpose, page_summary.auth_state)

        for step_def in steps:
            step_id = str(step_def.get("step_id", ""))
            if not step_id:
                continue

            # Check shutdown signal
            if self.shutdown_handler.is_shutting_down():
                log.warning("Workflow %s: shutdown signal received — stopping", wf_id)
                break

            # Check if workflow was paused/cancelled
            current = self.state_manager.get(wf_id)
            if current and current.status in ("paused", "cancelled"):
                log.info("Workflow %s: %s — stopping", wf_id, current.status)
                break

            self.state_manager.start_step(wf_id, step_id)
            await self._emit("step:started", {
                "workflow_id": wf_id, "step_id": step_id,
                "agent": step_def.get("agent"),
                "emit_status": step_def.get("emit_status", ""),
            })

            # Intelligent wait before action
            if self.config.features.get("smart_waiting", True):
                await self.smart_waiter.smart_wait(
                    self.page,
                    hints=[],
                    timeout_ms=self.config.timeouts.get("wait_ms", 15000),
                )

            # Update context memory
            await self.context_memory.update_navigation(self.page.url)

            # Save checkpoint before HIGH_RISK steps
            risk = step_def.get("risk", "LOW").upper()
            if risk in ("HIGH", "CRITICAL"):
                await self.state_manager.save_checkpoint(wf_id, step_id, self.page)

            step_t0 = time.time()
            result = await self._execute_step_with_recovery(step_def, data, wf_id)
            step_duration = (time.time() - step_t0) * 1000
            self.metrics.record_step(step_id, step_duration, result.get("success", False), step_def.get("agent", ""))

            if result.get("success"):
                self.state_manager.complete_step(wf_id, step_id, result)
                await self._emit("step:completed", {
                    "workflow_id": wf_id, "step_id": step_id, "output": result,
                })
            else:
                retry_count = self.state_manager.increment_retry(wf_id, step_id)
                if retry_count >= step_def.get("max_retries", 2):
                    on_failure = step_def.get("on_failure", "skip")
                    skip = on_failure in ("skip", "continue")
                    self.state_manager.fail_step(wf_id, step_id, result.get("error", ""), skip=skip)
                    await self._emit("step:failed", {
                        "workflow_id": wf_id, "step_id": step_id,
                        "error": result.get("error"),
                        "can_skip": skip,
                    })
                    if not skip:
                        break

        final_state = self.state_manager.get(wf_id)
        success = final_state and final_state.failed_steps == 0
        self.state_manager.complete_workflow(wf_id, success=bool(success))
        total_duration = (time.time() - t0) * 1000
        self.metrics.record_task_complete(task_id, total_duration, bool(success))

        await self.stop_monitoring()
        await self._emit("workflow:completed", {
            "workflow_id": wf_id,
            "success": success,
            "progress": self.state_manager.get_progress(wf_id),
            "audit_summary": self.audit.get_summary(),
            "network_summary": self.network_monitor.get_summary(),
            "metrics": self.metrics.to_prometheus_text()[:500],
        })

        return self.state_manager.get(wf_id)

    async def execute_step(self, step: dict, data: dict = {}) -> dict:
        """Execute a single planned step and return its result."""
        return await self._execute_step_with_recovery(step, data, "")

    # ── New high-level capability methods ─────────────────────────────────────

    async def get_page_intelligence(self, *, depth: str = "full") -> dict:
        """Return a comprehensive semantic + visual analysis of the current page."""
        summary = await self.semantic.analyze(self.page, depth=depth)
        classification = await self.vision.classify_page(self.page)
        network_summary = self.network_monitor.get_summary()
        context_snapshot = self.context_memory.snapshot()
        return {
            "url": summary.url,
            "title": summary.title,
            "purpose": summary.page_purpose,
            "auth_state": summary.auth_state,
            "loading_state": summary.loading_state,
            "errors": summary.errors,
            "forms": summary.forms,
            "prices": summary.prices,
            "has_modal": summary.has_modal,
            "tables": summary.tables,
            "cards": len(summary.cards),
            "tabs": summary.tabs,
            "search_bar": summary.search_bar,
            "filters": len(summary.filters),
            "toasts": summary.toast_notifications,
            "success_messages": summary.success_messages,
            "required_fields": summary.required_fields,
            "blockers": classification.blockers,
            "recommended_action": classification.recommended_action,
            "network": network_summary,
            "context": context_snapshot,
        }

    async def health_check(
        self, *, redis_client=None, ai_client=None
    ) -> dict:
        """Run a full health check across browser, Redis, and AI client."""
        return await self.health_checker.check_all(
            page=self.page,
            redis_client=redis_client,
            ai_client=ai_client,
        )

    def get_metrics(self) -> str:
        """Return Prometheus text format metrics."""
        return self.metrics.to_prometheus_text()

    async def plan_workflow(self, goal: str, domain: str, context: dict = {}) -> WorkflowPlan:
        """Decompose a natural language goal into an execution plan."""
        plan = self.workflow_planner.decompose(goal, domain, context)
        issues = self.workflow_planner.validate_plan(plan)
        if issues:
            log.warning("Workflow plan issues: %s", issues)
        return self.workflow_planner.optimize_plan(plan)

    async def wait_smart(self, hints: list = [], timeout_ms: int = 15000) -> bool:
        """Intelligently wait for the page to be ready."""
        return await self.smart_waiter.smart_wait(self.page, hints=hints, timeout_ms=timeout_ms)

    def get_context(self) -> dict:
        """Return current browser context memory snapshot."""
        return self.context_memory.snapshot()

    async def comprehensive_verify(self, checks: list) -> ComprehensiveVerification:
        """Run multiple verification checks in parallel."""
        return await self.verifier.comprehensive_verify(self.page, checks)

    def get_version_info(self) -> dict:
        """Return engine version and capability manifest."""
        return VersionInfo.to_dict()

    # ── Page intelligence methods ─────────────────────────────────────────────

    async def analyze_page(self, *, depth: str = "standard") -> dict:
        """Return a rich semantic analysis of the current page."""
        summary = await self.semantic.analyze(self.page, depth=depth)
        classification = await self.vision.classify_page(self.page)
        return {
            "url": summary.url,
            "title": summary.title,
            "purpose": summary.page_purpose,
            "auth_state": summary.auth_state,
            "loading_state": summary.loading_state,
            "errors": summary.errors,
            "forms": summary.forms,
            "prices": summary.prices,
            "has_modal": summary.has_modal,
            "blockers": classification.blockers,
            "recommended_action": classification.recommended_action,
        }

    async def dismiss_blockers(self) -> dict:
        """Auto-dismiss all detectable blocking popups."""
        dismissed = await self.popups.dismiss_all(self.page)
        return {"dismissed_count": dismissed}

    async def smart_scroll(self, *, full_page: bool = False, max_scrolls: int = 30) -> dict:
        """Intelligently scroll the page with lazy-load detection."""
        if full_page:
            return await self.scroller.full_page_scroll(self.page, max_scrolls=max_scrolls)
        return await self.scroller.full_page_scroll(self.page, max_scrolls=min(max_scrolls, 5))

    async def find_element(self, intent: str, context: dict = {}) -> Optional[dict]:
        """Find an element by human-language intent using 8-strategy resolution."""
        result = await self.resolver.resolve(self.page, intent, context)
        if not result:
            return None
        return {
            "strategy": result.strategy_used,
            "confidence": result.confidence,
            "locator": result.locator_string,
            "text": result.element_text,
        }

    async def fill_form_with_data(self, data: dict, *, form_selector: str = "form") -> dict:
        """Fill a form using provided data dict."""
        results = await self.filler.fill_form(self.page, data, form_selector=form_selector)
        return {
            "filled": [r.field_id for r in results if r.success],
            "failed": [r.field_id for r in results if not r.success],
            "blocked": [r.field_id for r in results if r.error and "BLOCKED" in (r.error or "")],
        }

    async def handle_login(self, *, email: str = "", password: str = "", provider: str = "auto") -> dict:
        """Handle login for any site with automatic method detection."""
        methods = await self.login.detect_login_method(self.page)
        log.info("Available login methods: %s", methods)

        if provider == "auto":
            if email and password and methods.get("password"):
                provider = "password"
            elif methods.get("google"):
                provider = "google"
            elif methods.get("github"):
                provider = "github"
            elif methods.get("magic_link") and email:
                provider = "magic_link"
            else:
                provider = "password"

        if provider == "password":
            result = await self.login.login_with_password(self.page, email, password)
        elif provider in ("google", "github", "apple", "microsoft", "linkedin"):
            result = await self.login.click_sso(self.page, provider)
        elif provider == "magic_link":
            result = await self.login.request_magic_link(self.page, email)
        else:
            result = await self.login.login_with_password(self.page, email, password)

        return {
            "success": result.success,
            "method": result.method_used,
            "needs_2fa": result.needs_2fa,
            "requires_user_action": result.requires_user_action,
            "details": result.details,
        }

    # ── Step-type handlers ────────────────────────────────────────────────────

    async def _execute_step_with_recovery(self, step: dict, data: dict, wf_id: str) -> dict:
        """Execute a step with automatic error recovery."""
        action_type = step.get("action_type", "")
        inputs = step.get("input", {})
        risk_str = step.get("risk", "LOW").upper()
        risk = RiskLevel.HIGH_RISK if risk_str == "HIGH" else (
            RiskLevel.CRITICAL if risk_str == "CRITICAL" else RiskLevel.LOW_RISK
        )

        step_id_label = f"{wf_id}:{step.get('step_id', 'unknown')}"

        record = await self.audit.record(
            self.page,
            action=action_type,
            inputs=inputs,
            outcome="pending",
            ai_reasoning=step.get("instruction", ""),
            agent=step.get("agent", "BROWSER_AGENT"),
            target_element=inputs.get("selector") or inputs.get("locator"),
            risk_level=risk_str + "_RISK",
        )

        # Redact sensitive inputs before logging
        safe_inputs = self.security.redact_for_log(inputs)

        try:
            result = await self._dispatch_action(action_type, inputs, data, risk, step)
            self.audit.set_output(record.step_id, result)
            self.audit.set_final_status(record.step_id, "completed" if result.get("success") else "failed")
            self.audit.set_verification(record.step_id, "passed" if result.get("success") else "failed")
            return result
        except Exception as exc:
            log.warning("Step %s failed: %s", step_id_label, exc)
            self.audit.add_error(record.step_id, str(exc))
            self.metrics.record_recovery(step_id_label, "attempt_1", False)

            recovery = await self.recovery.handle(self.page, exc)
            self.audit.add_recovery(record.step_id)

            if recovery.success:
                self.metrics.record_recovery(step_id_label, recovery.strategy_used, True)
                try:
                    result = await self._dispatch_action(action_type, inputs, data, risk, step)
                    self.audit.set_output(record.step_id, result)
                    self.audit.set_final_status(record.step_id, "completed")
                    return result
                except Exception as exc2:
                    self.audit.set_final_status(record.step_id, "failed")
                    return {"success": False, "error": str(exc2), "recovery_failed": True}

            if recovery.escalate_to_user:
                await self._emit("step:needs_user", {
                    "error_type": recovery.error_type,
                    "error_category": recovery.error_category,
                    "reason": recovery.reason,
                })

            self.audit.set_final_status(record.step_id, "failed")
            return {"success": False, "error": recovery.reason, "escalate": recovery.escalate_to_user}

    async def _dispatch_action(
        self,
        action_type: str,
        inputs: dict,
        data: dict,
        risk: RiskLevel,
        step: dict,
    ) -> dict:
        """Route action_type to the correct subsystem."""
        description = step.get("instruction", action_type)

        # ── Browser actions ──
        if action_type == "navigate":
            url = inputs.get("url", "")
            r = await self.executor.navigate(self.page, url)
            await self.context_memory.update_navigation(url)
            return self._action_to_dict(r)

        if action_type == "click":
            sel = await self._resolve_selector(inputs, description)
            if not sel:
                return {"success": False, "error": "Could not resolve selector"}
            r = await self.executor.click(self.page, sel, description=description, risk=risk)
            return self._action_to_dict(r)

        if action_type == "type":
            sel = await self._resolve_selector(inputs, description)
            text = inputs.get("text", "") or data.get(inputs.get("field_name", ""), "")
            if not sel or not text:
                return {"success": False, "error": "Missing selector or text"}
            r = await self.executor.type_text(self.page, sel, str(text), description=description)
            return self._action_to_dict(r)

        if action_type == "press_key":
            r = await self.executor.press_key(self.page, inputs.get("key", "Enter"))
            return self._action_to_dict(r)

        if action_type == "select":
            sel = await self._resolve_selector(inputs, description)
            r = await self.executor.select_option(self.page, sel, inputs.get("value", ""))
            return self._action_to_dict(r)

        if action_type == "hover":
            sel = await self._resolve_selector(inputs, description)
            r = await self.executor.hover(self.page, sel)
            return self._action_to_dict(r)

        if action_type == "scroll":
            direction = inputs.get("direction", "down")
            pixels = float(inputs.get("pixels", 500))
            await self.scroller.smooth_scroll(self.page, pixels, direction=direction)
            return {"success": True, "action_type": "scroll"}

        if action_type == "wait":
            sel = inputs.get("selector", "")
            hints = inputs.get("hints", [])
            if sel:
                r = await self.executor.wait_for_element(
                    self.page, sel,
                    state=inputs.get("state", "visible"),
                    timeout_ms=inputs.get("timeout_ms", self.config.timeouts.get("wait_ms", 10000)),
                )
                return self._action_to_dict(r)
            elif hints:
                ok = await self.smart_waiter.smart_wait(self.page, hints=hints)
                return {"success": ok, "action_type": "wait"}
            await asyncio.sleep(inputs.get("seconds", 1.0))
            return {"success": True, "action_type": "wait"}

        # ── Vision/analysis actions ──
        if action_type in ("analyze", "verify", "find", "diagnose", "detect"):
            page_info = await self.get_page_intelligence(depth="standard")
            return {"success": True, "action_type": action_type, "page_analysis": page_info}

        if action_type == "screenshot":
            b64 = await self.vision.capture_screenshot(self.page)
            return {"success": True, "action_type": "screenshot", "screenshot_b64": b64}

        # ── DOM tracking ──
        if action_type == "get_dom_changes":
            changes = await self.dom_tracker.get_significant_changes(self.page)
            return {"success": True, "action_type": action_type, "changes": [c.__dict__ if hasattr(c, "__dict__") else str(c) for c in changes]}

        # ── Form actions ──
        if action_type in ("fill_form", "fill_text", "fill_select", "fill_date", "fill_check", "fill_radio"):
            fill_data = inputs.get("data", {}) or {inputs.get("field", ""): inputs.get("value", "")}
            fill_data.update({k: v for k, v in data.items() if v})
            result_dict = await self.fill_form_with_data(fill_data, form_selector=inputs.get("form_selector", "form"))
            result_dict["success"] = len(result_dict.get("failed", [])) == 0
            result_dict["action_type"] = action_type
            return result_dict

        # ── Data extraction ──
        if action_type in ("extract", "extract_table", "extract_list", "extract_kv", "extract_form"):
            summary = await self.semantic.analyze(self.page)
            return {
                "success": True, "action_type": action_type,
                "prices": summary.prices, "dates": summary.dates,
                "forms": summary.forms, "errors": summary.errors,
                "tables": summary.tables, "cards": summary.cards[:5],
            }

        # ── Login ──
        if action_type == "login":
            return await self.handle_login(
                email=inputs.get("email", data.get("email", "")),
                password=inputs.get("password", data.get("password", "")),
                provider=inputs.get("provider", "auto"),
            )

        # ── Verification ──
        if action_type == "verify_navigation":
            r = await self.verifier.verify_navigation(
                self.page,
                inputs.get("expected_url", ""),
                expected_title_fragment=inputs.get("expected_title", ""),
            )
            return {"success": r.success, "confidence": r.confidence, "details": r.details}

        if action_type == "verify_submission":
            before_snap = inputs.get("before_snapshot", {})
            r = await self.verifier.verify_form_submission(
                self.page,
                before_url=before_snap.get("url", ""),
                before_hash=before_snap.get("content_hash", ""),
            )
            return {"success": r.success, "confidence": r.confidence, "details": r.details}

        if action_type == "verify_completion":
            checks = inputs.get("checks", [{"type": "no_errors"}])
            cv = await self.verifier.comprehensive_verify(self.page, checks)
            return {
                "success": cv.overall_success,
                "confidence": cv.confidence,
                "checks_passed": cv.checks_passed,
                "checks_total": cv.checks_total,
                "failures": cv.failure_reasons,
            }

        # ── Popup handling ──
        if action_type == "dismiss_popups":
            dismissed = await self.popups.dismiss_all(self.page)
            return {"success": True, "dismissed_count": dismissed}

        # ── Context/network ──
        if action_type == "get_context":
            return {"success": True, "context": self.context_memory.snapshot()}

        if action_type == "get_network":
            return {"success": True, "network": self.network_monitor.get_summary()}

        log.warning("Unknown action_type: %s — skipping", action_type)
        return {"success": True, "action_type": action_type, "skipped": True}

    async def _resolve_selector(self, inputs: dict, description: str) -> str:
        """Get a working selector — from inputs first, then intent-resolution."""
        sel = inputs.get("selector") or inputs.get("locator") or ""
        if sel:
            stable = await self.resolver.verify_stable(self.page, sel)
            if stable:
                return sel

        resolved = await self.resolver.resolve(
            self.page,
            inputs.get("intent") or description,
            {"fallback_selectors": inputs.get("fallback_selectors", [])},
        )
        return resolved.locator_string if resolved else sel

    def _action_to_dict(self, r: ActionResult) -> dict:
        return {
            "success": r.success,
            "action_type": r.action_type,
            "risk_level": r.risk_level,
            "error": r.error,
            "needs_user_approval": r.needs_user_approval,
            "duration_ms": r.duration_ms,
            "output": r.output,
        }

    async def _emit(self, event_type: str, payload: dict) -> None:
        if self._on_event:
            try:
                await self._on_event(event_type, payload)
            except Exception as exc:
                log.debug("on_event callback error: %s", exc)

    async def capture_fixture(
        self,
        label: str,
        *,
        save: bool = False,
        fixture_dir: str = "./fixtures",
        metadata: Optional[dict] = None,
    ) -> FixtureBundle:
        """Capture a complete page fixture at the current browser state.

        Args:
            label: Human-readable name for this fixture (e.g. 'checkout_page').
            save: If True, persist the bundle to disk under fixture_dir.
            fixture_dir: Root directory for fixture storage (default ./fixtures).
            metadata: Extra key-value pairs attached to the bundle's metadata.

        Returns:
            FixtureBundle with DOM, accessibility, screenshot, storage, console logs.
        """
        capturer = FixtureCapturer(wait_for_idle=True, capture_screenshot=True)
        workflow_id = getattr(self, "_current_workflow_id", "")
        bundle = await capturer.capture(
            self.page, label, workflow_id=workflow_id, metadata=metadata or {}
        )
        if save:
            store = FixtureStore(base_dir=fixture_dir)
            store.save(bundle)
            log.info("Fixture auto-saved: %s/%s", fixture_dir, bundle.fixture_id)
        return bundle

    async def _cleanup(self) -> None:
        """Cleanup callback called on graceful shutdown."""
        try:
            await self.stop_monitoring()
        except Exception:
            pass
        log.info("BrowserEngine: cleanup complete")
