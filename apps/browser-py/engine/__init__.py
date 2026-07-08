"""Browser Engine v2.1.0 — public API.

Import from here:
    from engine import BrowserEngine, ElementResolver, FormFiller, ...

New in v2.0.0:
    BrowserContextMemory, NetworkMonitor, SmartWaiter, DOMTracker,
    WorkflowPlanner, TaskManager, EngineMetrics, SecurityManager,
    AIDecisionLog, EngineConfig, HealthChecker, GracefulShutdown,
    VersionInfo, FeatureFlags, ErrorCategory, ComprehensiveVerification

New in v2.1.0:
    FixtureCapturer, FixtureBundle, FixtureStore, FixtureDiffer,
    FixtureDiffResult, FixtureReplayer, MockPage
"""

from .browser_engine import BrowserEngine

# Core resolvers and fillers
from .element_resolver import ElementResolver, ResolvedElement
from .form_filler import FormFiller, FieldAnalysis, FillResult
from .scroll_engine import ScrollEngine
from .popup_handler import PopupHandler, PopupDetection

# Page intelligence
from .semantic_page import SemanticPage, PageSummary, PageElement
from .vision_engine import VisionEngine, VisualElement, VisualDiff, PageClassification

# Action execution
from .action_executor import ActionExecutor, ActionResult, RiskLevel

# Verification
from .verifier import Verifier, VerificationResult, ComprehensiveVerification

# Error handling
from .error_recovery import ErrorRecovery, RecoveryResult, ErrorCategory

# State and workflow
from .workflow_state import WorkflowStateManager, WorkflowState, StepState, Checkpoint
from .workflow_planner import WorkflowPlanner, WorkflowPlan, PlannedStep

# Auth
from .login_manager import LoginManager, LoginResult, AuthState

# Observability
from .audit_trail import AuditTrail, StepRecord

# Phase 2 — new capabilities
from .context_memory import BrowserContextMemory
from .network_monitor import NetworkMonitor, NetworkRequest
from .smart_waiter import SmartWaiter
from .dom_tracker import DOMTracker, DOMChange
from .task_manager import TaskManager, ManagedTask
from .metrics import EngineMetrics
from .security import SecurityManager, SecureStore, SessionIsolation
from .decision_log import AIDecisionLog, AIDecision, CandidateAction
from .config import EngineConfig, get_config, set_config
from .health import HealthChecker, GracefulShutdown, VersionInfo, FeatureFlags, setup_structured_logging

# Fixture infrastructure (v2.1.0)
from .fixture_capture import FixtureCapturer, FixtureBundle
from .fixture_store import FixtureStore
from .fixture_diff import FixtureDiffer, FixtureDiffResult, DomStructureDiff, StorageDiff
from .fixture_replay import FixtureReplayer, MockPage, MockLocator, MockElement

# Outcome + ground truth (v2.1.0)
from .outcome_model import OutcomeManager, WorkflowOutcome, OutcomeState, ConfirmationResult
from .ground_truth import (
    GroundTruthProvider,
    FoodOrderGroundTruth,
    JobApplicationGroundTruth,
    TravelBookingGroundTruth,
    ShoppingOrderGroundTruth,
    EmailSentGroundTruth,
    GenericGroundTruth,
    get_ground_truth_provider,
)
from .confidence_model import ConfidenceModel, StepConfidence
from .pre_action_snapshot import PreActionSnapshotter, PreActionSnapshot, SnapshotRisk

VERSION = "2.1.0"

CAPABILITIES = [
    "universal_page_understanding",
    "advanced_element_intelligence",
    "browser_context_memory",
    "network_monitoring",
    "intelligent_waiting",
    "dynamic_dom_tracking",
    "full_visual_analysis",
    "smart_workflow_planner",
    "risk_assessment",
    "comprehensive_verification",
    "error_classification",
    "recovery_strategy",
    "parallel_task_management",
    "workflow_checkpoints",
    "comprehensive_audit_trail",
    "observability_metrics",
    "security",
    "ai_decision_logging",
    "configuration_management",
    "production_readiness",
]

__all__ = [
    # Core
    "BrowserEngine",
    "VERSION",
    "CAPABILITIES",
    # Element resolution
    "ElementResolver",
    "ResolvedElement",
    # Form
    "FormFiller",
    "FieldAnalysis",
    "FillResult",
    # Scroll
    "ScrollEngine",
    # Popups
    "PopupHandler",
    "PopupDetection",
    # Page intelligence
    "SemanticPage",
    "PageSummary",
    "PageElement",
    "VisionEngine",
    "VisualElement",
    "VisualDiff",
    "PageClassification",
    # Action execution
    "ActionExecutor",
    "ActionResult",
    "RiskLevel",
    # Verification
    "Verifier",
    "VerificationResult",
    "ComprehensiveVerification",
    # Error recovery
    "ErrorRecovery",
    "RecoveryResult",
    "ErrorCategory",
    # Workflow
    "WorkflowStateManager",
    "WorkflowState",
    "StepState",
    "Checkpoint",
    "WorkflowPlanner",
    "WorkflowPlan",
    "PlannedStep",
    # Auth
    "LoginManager",
    "LoginResult",
    "AuthState",
    # Audit
    "AuditTrail",
    "StepRecord",
    # Phase 2
    "BrowserContextMemory",
    "NetworkMonitor",
    "NetworkRequest",
    "SmartWaiter",
    "DOMTracker",
    "DOMChange",
    "TaskManager",
    "ManagedTask",
    "EngineMetrics",
    "SecurityManager",
    "SecureStore",
    "SessionIsolation",
    "AIDecisionLog",
    "AIDecision",
    "CandidateAction",
    "EngineConfig",
    "get_config",
    "set_config",
    "HealthChecker",
    "GracefulShutdown",
    "VersionInfo",
    "FeatureFlags",
    "setup_structured_logging",
    # Fixture infrastructure
    "FixtureCapturer",
    "FixtureBundle",
    "FixtureStore",
    "FixtureDiffer",
    "FixtureDiffResult",
    "DomStructureDiff",
    "StorageDiff",
    "FixtureReplayer",
    "MockPage",
    "MockLocator",
    "MockElement",
    # Outcome + ground truth
    "OutcomeManager",
    "WorkflowOutcome",
    "OutcomeState",
    "ConfirmationResult",
    "GroundTruthProvider",
    "FoodOrderGroundTruth",
    "JobApplicationGroundTruth",
    "TravelBookingGroundTruth",
    "ShoppingOrderGroundTruth",
    "EmailSentGroundTruth",
    "GenericGroundTruth",
    "get_ground_truth_provider",
    "ConfidenceModel",
    "StepConfidence",
    "PreActionSnapshotter",
    "PreActionSnapshot",
    "SnapshotRisk",
]
