import { ParsedGoal } from '../../agent/goal-understanding.service';
import { AgentPlan, PlannedStep } from '../../shared/interfaces/agent.interfaces';
import { DomainSkill } from '../skill.interface';

export class AmazonSkill implements DomainSkill {
  readonly name = 'amazon-purchase';
  readonly category = 'shopping';
  readonly supportedDomains = ['amazon.in', 'www.amazon.in', 'amazon.com', 'www.amazon.com'];

  canHandle(goal: ParsedGoal): boolean {
    if (goal.taskType !== 'shopping' && goal.taskType !== 'price_comparison') {
      return false;
    }

    const preferred = (goal.preferredWebsites ?? []).map((s) => s.toLowerCase());
    const intentLower = (goal.intent ?? '').toLowerCase();

    return (
      preferred.some((site) => site.includes('amazon')) ||
      intentLower.includes('amazon')
    );
  }

  buildPlan(goal: ParsedGoal): AgentPlan {
    const productName: string = goal.entities?.productName ?? 'Logitech mouse';
    const maxPrice: number | undefined = goal.entities?.maxPrice ?? goal.entities?.budget;

    const steps: PlannedStep[] = [
      {
        index: 0,
        action: 'navigate',
        target: undefined,
        value: 'https://www.amazon.in',
        description: 'Navigate to Amazon India homepage',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: {
          type: 'network_idle',
          value: '3000',
          timeoutMs: 10000,
        },
      },
      {
        index: 1,
        action: 'click',
        target: '#twotabsearchtextbox, input[placeholder*="Search"]',
        description: 'Click on the Amazon search box',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
      },
      {
        index: 2,
        action: 'type',
        target: '#twotabsearchtextbox, input[placeholder*="Search"]',
        value: productName,
        description: `Type product name "${productName}" in search box`,
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'FormFillSkill',
      },
      {
        index: 3,
        action: 'press_key',
        value: 'Enter',
        description: 'Press Enter to submit search query',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: {
          type: 'selector',
          value: '.s-search-results',
          timeoutMs: 15000,
        },
      },
      {
        index: 4,
        action: 'click',
        target: 'span.a-dropdown-label:contains("Sort by"), #s-result-sort-select',
        description: 'Open sorting options dropdown',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
      },
      {
        index: 5,
        action: 'select',
        target: '#s-result-sort-select',
        value: 'price-asc-rank',
        description: 'Sort search results by Price: Low to High',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'FormFillSkill',
        waitCondition: {
          type: 'network_idle',
          value: '2000',
          timeoutMs: 10000,
        },
      },
      {
        index: 6,
        action: 'click',
        target: '[data-component-type="s-search-result"]:first-child h2 a',
        description: 'Click the first product result matching search criteria',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: {
          type: 'network_idle',
          value: '3000',
          timeoutMs: 15000,
        },
      },
      {
        index: 7,
        action: 'click',
        target: '#add-to-cart-button, input[name="submit.add-to-cart"]',
        description: 'Add the selected product to cart',
        riskLevel: 'MEDIUM',
        requiresApproval: false,
        skillName: 'PurchaseSkill',
        waitCondition: {
          type: 'selector',
          value: '#attach-view-cart-button-form, a[href*="/cart"]',
          timeoutMs: 10000,
        },
      },
      {
        index: 8,
        action: 'click',
        target: '#attach-view-cart-button-form input[type="submit"], a[href*="/cart"]',
        description: 'Open shopping cart to review items',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: {
          type: 'selector',
          value: 'input[name="proceedToRetailCheckout"]',
          timeoutMs: 10000,
        },
      },
      {
        index: 9,
        action: 'click',
        target: 'input[name="proceedToRetailCheckout"]',
        description: 'Proceed to checkout page',
        riskLevel: 'MEDIUM',
        requiresApproval: true,
        skillName: 'PurchaseSkill',
        waitCondition: {
          type: 'network_idle',
          value: '3000',
          timeoutMs: 15000,
        },
      },
      {
        index: 10,
        action: 'click',
        target: 'input[aria-labelledby="placeYourOrderSubmitLabel"], #placeYourOrder',
        description: 'Complete purchase payment — REQUIRES EXPLICIT USER APPROVAL',
        riskLevel: 'CRITICAL',
        requiresApproval: true,
        skillName: 'PurchaseSkill',
        waitCondition: {
          type: 'network_idle',
          value: '4000',
          timeoutMs: 20000,
        },
      },
    ];

    const priceNote = maxPrice ? ` under ₹${maxPrice}` : '';

    return {
      taskId: '',
      goal: `Purchase ${productName}${priceNote} on Amazon`,
      steps,
      estimatedDuration: 150,
      riskAssessment: {
        overallRisk: 'CRITICAL',
        reasons: ['Performs checkout and processes financial payment'],
        requiresUserApproval: true,
      },
      skillsUsed: ['NavigationSkill', 'FormFillSkill', 'PurchaseSkill'],
    };
  }
}
