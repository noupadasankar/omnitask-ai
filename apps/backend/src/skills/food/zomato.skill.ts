import { ParsedGoal } from '../../agent/goal-understanding.service';
import { AgentPlan, PlannedStep } from '../../shared/interfaces/agent.interfaces';
import { DomainSkill } from '../skill.interface';

export class ZomatoSkill implements DomainSkill {
  readonly name = 'zomato-order';
  readonly category = 'food';
  readonly supportedDomains = ['zomato.com', 'www.zomato.com'];

  canHandle(goal: ParsedGoal): boolean {
    if (goal.taskType !== 'food_order') {
      return false;
    }

    const preferred = (goal.preferredWebsites ?? []).map((s) => s.toLowerCase());
    const intentLower = (goal.intent ?? '').toLowerCase();

    const prefersZomato = preferred.some((site) => site.includes('zomato'));
    const intentMentionsZomato = intentLower.includes('zomato');
    const noPreference = preferred.length === 0;

    return prefersZomato || intentMentionsZomato || noPreference;
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
        value: 'https://www.zomato.com',
        description: 'Open Zomato homepage',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: { type: 'network_idle', value: '3000', timeoutMs: 10000 },
      },
      {
        index: 1,
        action: 'click',
        target: '[data-testid="location-search-input"], .location-input, input[placeholder*="location"], input[placeholder*="Search"]',
        description: 'Click on the location/delivery address input field',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
      },
      {
        index: 2,
        action: 'type',
        target: '[data-testid="location-search-input"], .location-input, input[placeholder*="location"]',
        value: location ?? 'Current Location',
        description: `Set delivery location to "${location ?? 'Current Location'}"`,
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'FormFillSkill',
        waitCondition: { type: 'selector', value: '.location-suggestions, [data-testid="suggestion-list"]', timeoutMs: 10000 },
      },
      {
        index: 3,
        action: 'click',
        target: '.location-suggestions li:first-child, [data-testid="suggestion-item"]:first-child',
        description: 'Select first location suggestion from dropdown',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: { type: 'network_idle', value: '2000', timeoutMs: 10000 },
      },
      {
        index: 4,
        action: 'click',
        target: '[data-testid="search-input"], input[placeholder*="Search for restaurant"], .search-input input',
        description: 'Click the food or restaurant search bar',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: { type: 'selector', value: '[data-testid="search-input"], .search-input', timeoutMs: 10000 },
      },
      {
        index: 5,
        action: 'type',
        target: '[data-testid="search-input"], input[placeholder*="Search for restaurant"], .search-input input',
        value: restaurant ?? foodItem,
        description: `Search for "${restaurant ?? foodItem}" on Zomato`,
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'FormFillSkill',
        waitCondition: { type: 'selector', value: '.search-results, [data-testid="search-results"]', timeoutMs: 10000 },
      },
      {
        index: 6,
        action: 'click',
        target: '[data-testid="search-result-item"]:first-child, .search-result-restaurant:first-child, .restaurant-card:first-child',
        description: restaurant
          ? `Select restaurant matching "${restaurant}"`
          : 'Select the top restaurant result from search',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: { type: 'network_idle', value: '2000', timeoutMs: 10000 },
      },
      {
        index: 7,
        action: 'click',
        target: `[data-testid="menu-item"][data-name*="${foodItem}"], .menu-item:contains("${foodItem}") .add-to-cart-btn, .dish-card:first-child .add-to-cart-btn`,
        description: `Find "${foodItem}" in the restaurant menu and click Add`,
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: { type: 'selector', value: '.add-to-cart-btn, [data-testid="add-to-cart"]', timeoutMs: 10000 },
      },
      {
        index: 8,
        action: 'click',
        target: '[data-testid="add-to-cart"], .add-to-cart-btn, button[aria-label*="Add"]',
        description: 'Click Add to Cart button for the selected food item',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: { type: 'selector', value: '.cart-count, [data-testid="cart-count"]', timeoutMs: 10000 },
      },
      {
        index: 9,
        action: 'click',
        target: '[data-testid="view-cart-btn"], .view-cart-btn, .cart-container button, a[href*="/checkout"]',
        description: 'Open cart to review order before checkout',
        riskLevel: 'LOW',
        requiresApproval: false,
        skillName: 'NavigationSkill',
        waitCondition: { type: 'selector', value: '.cart-items, [data-testid="cart-items"]', timeoutMs: 10000 },
      },
      {
        index: 10,
        action: 'click',
        target: '[data-testid="proceed-to-checkout"], .proceed-to-checkout-btn, button[class*="checkout"]',
        description: 'Proceed to checkout page',
        riskLevel: 'MEDIUM',
        requiresApproval: true,
        skillName: 'PurchaseSkill',
        waitCondition: { type: 'network_idle', value: '2000', timeoutMs: 10000 },
      },
      {
        index: 11,
        action: 'click',
        target: '[data-testid="place-order-btn"], .place-order-btn, button[class*="pay"], button[class*="order"]',
        description: 'Place order and proceed to payment — REQUIRES USER APPROVAL before executing',
        riskLevel: 'CRITICAL',
        requiresApproval: true,
        skillName: 'PurchaseSkill',
        waitCondition: { type: 'selector', value: '.payment-options, [data-testid="payment-section"]', timeoutMs: 10000 },
      },
    ];

    const budgetNote = budget ? ` (budget: ${budget})` : '';
    const restaurantNote = restaurant ? ` from ${restaurant}` : '';

    return {
      taskId: '',
      goal: `Order "${foodItem}"${restaurantNote} on Zomato${budgetNote}`,
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
