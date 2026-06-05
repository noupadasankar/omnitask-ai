import { ParsedGoal } from '../../agent/goal-understanding.service';
import { AgentPlan, PlannedStep } from '../../shared/interfaces/agent.interfaces';
import { DomainSkill } from '../skill.interface';

export class SwiggySkill implements DomainSkill {
  readonly name = 'swiggy-order';
  readonly category = 'food';
  readonly supportedDomains = ['swiggy.com', 'www.swiggy.com'];

  canHandle(goal: ParsedGoal): boolean {
    if (goal.taskType !== 'food_order') {
      return false;
    }

    const preferred = (goal.preferredWebsites ?? []).map((s) => s.toLowerCase());
    const intentLower = (goal.intent ?? '').toLowerCase();

    const prefersSwiggy = preferred.some((site) => site.includes('swiggy'));
    const intentMentionsSwiggy = intentLower.includes('swiggy');

    return prefersSwiggy || intentMentionsSwiggy;
  }

  buildPlan(goal: ParsedGoal): AgentPlan {
    const foodItem: string = goal.entities?.foodItem ?? 'food';
    const restaurant: string | undefined = goal.entities?.restaurant;
    const budget: string | undefined = goal.entities?.budget;
    const location: string | undefined = goal.entities?.location;

    const steps: PlannedStep[] = [
      {
        index: 0,
        action: 'navigate',
        target: undefined,
        value: 'https://www.swiggy.com',
        description: 'Open Swiggy homepage',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: { type: 'network_idle', value: '3000', timeoutMs: 10000 },
      },
      {
        index: 1,
        action: 'click',
        target: '[data-testid="location-input"], input[placeholder*="location"], input[placeholder*="Enter location"], .location-search-input',
        description: 'Click the delivery location input field',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
      },
      {
        index: 2,
        action: 'type',
        target: '[data-testid="location-input"], input[placeholder*="location"], .location-search-input',
        value: location ?? 'Current Location',
        description: `Type delivery location: "${location ?? 'Current Location'}"`,
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'FormFillSkill',
        waitCondition: { type: 'selector', value: '.location-dropdown, [data-testid="location-suggestions"]', timeoutMs: 10000 },
      },
      {
        index: 3,
        action: 'click',
        target: '.location-dropdown li:first-child, [data-testid="location-suggestion"]:first-child, ._1hXlv:first-child',
        description: 'Select the first suggested delivery location',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: { type: 'network_idle', value: '2000', timeoutMs: 10000 },
      },
      {
        index: 4,
        action: 'click',
        target: '[data-testid="search-bar"], input[placeholder*="Search for restaurants"], ._1iJDi input, .search-bar input',
        description: 'Click the Swiggy search bar',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: { type: 'selector', value: '[data-testid="search-bar"], .search-bar', timeoutMs: 10000 },
      },
      {
        index: 5,
        action: 'type',
        target: '[data-testid="search-bar"], input[placeholder*="Search for restaurants"], ._1iJDi input',
        value: restaurant ?? foodItem,
        description: `Search Swiggy for "${restaurant ?? foodItem}"`,
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'FormFillSkill',
        waitCondition: { type: 'selector', value: '.search-results, [data-testid="search-results"]', timeoutMs: 10000 },
      },
      {
        index: 6,
        action: 'click',
        target: '[data-testid="restaurant-item"]:first-child, .restaurant-item:first-child, ._1NSla:first-child',
        description: restaurant
          ? `Click restaurant matching "${restaurant}" from search results`
          : 'Click the top restaurant result',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: { type: 'network_idle', value: '2000', timeoutMs: 10000 },
      },
      {
        index: 7,
        action: 'click',
        target: `[data-testid="menu-item-name"]:contains("${foodItem}"), .menu-item-title:contains("${foodItem}"), ._3bvLF:first-child`,
        description: `Locate "${foodItem}" in the menu`,
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: { type: 'selector', value: '.menu-item, [data-testid="menu-item"]', timeoutMs: 10000 },
      },
      {
        index: 8,
        action: 'click',
        target: '[data-testid="add-item-btn"], .add-item-btn, button._3FSId, button[class*="add-item"]',
        description: `Add "${foodItem}" to cart`,
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: { type: 'selector', value: '.cart-widget, [data-testid="cart-widget"]', timeoutMs: 10000 },
      },
      {
        index: 9,
        action: 'click',
        target: '[data-testid="cart-icon"], .cart-widget, ._3PTBA, a[href*="/checkout"]',
        description: 'Open cart to review items before checkout',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: { type: 'selector', value: '.cart-container, [data-testid="cart-container"]', timeoutMs: 10000 },
      },
      {
        index: 10,
        action: 'click',
        target: '[data-testid="proceed-to-checkout"], .proceed-btn, button._3FSId[class*="checkout"], button[class*="proceed"]',
        description: 'Proceed to checkout — REQUIRES USER APPROVAL',
        riskLevel: 'MEDIUM',
        requiresApproval: true,
        skillName: 'PurchaseSkill',
        waitCondition: { type: 'network_idle', value: '2000', timeoutMs: 10000 },
      },
      {
        index: 11,
        action: 'click',
        target: '[data-testid="place-order-btn"], .place-order-btn, button[class*="pay"], button[class*="place-order"]',
        description: 'Confirm and place order — REQUIRES USER APPROVAL before payment is initiated',
        riskLevel: 'CRITICAL',
        requiresApproval: true,
        skillName: 'PurchaseSkill',
        waitCondition: { type: 'selector', value: '.payment-options, [data-testid="payment-options"]', timeoutMs: 10000 },
      },
    ];

    const budgetNote = budget ? ` (budget: ${budget})` : '';
    const restaurantNote = restaurant ? ` from ${restaurant}` : '';

    return {
      taskId: '',
      goal: `Order "${foodItem}"${restaurantNote} on Swiggy${budgetNote}`,
      steps,
      estimatedDuration: 90,
      riskAssessment: {
        overallRisk: 'CRITICAL',
        reasons: ['Processes checkout and initiates payment triggers'],
        requiresUserApproval: true,
      },
      skillsUsed: ['NavigationSkill', 'FormFillSkill', 'PurchaseSkill'],
    };
  }
}
