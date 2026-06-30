import { ParsedGoal } from '../../agent/goal-understanding.service';
import { AgentPlan, PlannedStep } from '../../shared/interfaces/agent.interfaces';
import { DomainSkill } from '../skill.interface';

export class FlipkartSkill implements DomainSkill {
  readonly name = 'flipkart-purchase';
  readonly category = 'shopping';
  readonly supportedDomains = ['flipkart.com', 'www.flipkart.com'];

  canHandle(goal: ParsedGoal): boolean {
    if (goal.taskType !== 'shopping' && goal.taskType !== 'price_comparison') {
      return false;
    }

    const preferred = (goal.preferredWebsites ?? []).map((s) => s.toLowerCase());
    const intentLower = (goal.intent ?? '').toLowerCase();

    return (
      preferred.some((site) => site.includes('flipkart')) ||
      intentLower.includes('flipkart')
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
        value: 'https://www.flipkart.com',
        description: 'Navigate to Flipkart homepage',
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
        target: 'input[title*="Search"], input[placeholder*="Search"]',
        description: 'Click on the Flipkart search input',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
      },
      {
        index: 2,
        action: 'type',
        target: 'input[title*="Search"], input[placeholder*="Search"]',
        value: productName,
        description: `Type product name "${productName}" in search bar`,
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
          value: 'div[class*="_1AtVb2"]',
          timeoutMs: 15000,
        },
      },
      {
        index: 4,
        action: 'click',
        target: 'div:contains("Price -- Low to High"), ._10UFw0:contains("Low to High")',
        description: 'Sort results by price: Low to High',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: {
          type: 'network_idle',
          value: '2000',
          timeoutMs: 10000,
        },
      },
      {
        index: 5,
        action: 'click',
        target: 'a[class*="_1fQZEK"]:first-child, a[class*="_2rpwqI"]:first-child, div[class*="_1AtVb2"] a:first-child',
        description: 'Click the cheapest product from search results',
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
        index: 6,
        action: 'click',
        target: 'button[class*="_2KpZ6l _2U9uOA _3v1-ww"], button:contains("ADD TO CART")',
        description: 'Add the product to the shopping cart',
        riskLevel: 'MEDIUM',
        requiresApproval: false,
        skillName: 'PurchaseSkill',
        waitCondition: {
          type: 'selector',
          value: 'span:contains("My Cart")',
          timeoutMs: 10000,
        },
      },
      {
        index: 7,
        action: 'click',
        target: 'button[class*="_2KpZ6l _2ObVZr _3AieaC _3ASgKy"], button:contains("PLACE ORDER")',
        description: 'Initiate order placement checkout — REQUIRES APPROVAL',
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
        index: 8,
        action: 'click',
        target: 'button:contains("Deliver Here"), button[class*="_1w3A2F"]',
        description: 'Confirm shipping delivery address',
        riskLevel: 'MEDIUM',
        requiresApproval: true,
        skillName: 'FormFillSkill',
        waitCondition: {
          type: 'network_idle',
          value: '2000',
          timeoutMs: 10000,
        },
      },
      {
        index: 9,
        action: 'click',
        target: 'button:contains("CONTINUE"), button[class*="_2KpZ6l _1secGQ"]',
        description: 'Continue checkout to payment options',
        riskLevel: 'MEDIUM',
        requiresApproval: true,
        skillName: 'NavigationSkill',
        waitCondition: {
          type: 'selector',
          value: 'div:contains("Payment Options")',
          timeoutMs: 15000,
        },
      },
      {
        index: 10,
        action: 'click',
        target: 'button:contains("PAY"), button[class*="_2KpZ6l _2U9uOA _3v1-ww"]',
        description: 'Complete purchase payment — REQUIRES EXPLICIT USER APPROVAL',
        riskLevel: 'CRITICAL',
        requiresApproval: true,
        skillName: 'PurchaseSkill',
        waitCondition: {
          type: 'network_idle',
          value: '3000',
          timeoutMs: 15000,
        },
      },
    ];

    const priceNote = maxPrice ? ` under ₹${maxPrice}` : '';

    return {
      taskId: '',
      goal: `Purchase ${productName}${priceNote} on Flipkart`,
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
