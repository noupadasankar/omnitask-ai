import { ParsedGoal } from '../../agent/goal-understanding.service';
import { AgentPlan } from '../../shared/interfaces/agent.interfaces';
import { DomainSkill } from '../skill.interface';

export class LinkedInSkill implements DomainSkill {
  readonly name = 'linkedin-apply';
  readonly category = 'job';
  readonly supportedDomains = ['linkedin.com', 'www.linkedin.com'];

  canHandle(goal: ParsedGoal): boolean {
    return (
      goal.taskType === 'job_search' ||
      goal.preferredWebsites.some((site) =>
        site.toLowerCase().includes('linkedin'),
      ) ||
      goal.intent.toLowerCase().includes('linkedin')
    );
  }

  buildPlan(goal: ParsedGoal): any {
    const jobTitle: string =
      goal.entities?.jobTitle ?? goal.entities?.role ?? 'React Developer';
    const location: string | undefined =
      goal.entities?.location ?? goal.entities?.city ?? undefined;
    const experienceLevel: string | undefined =
      goal.entities?.experienceLevel ?? undefined;

    const steps = [
      {
        index: 0,
        action: 'navigate',
        target: 'https://www.linkedin.com/jobs',
        description: 'Navigate to LinkedIn Jobs homepage',
        waitCondition: { type: 'networkIdle', value: 3000 },
      },
      {
        index: 1,
        action: 'click',
        target: 'input[aria-label="Search by title, skill, or company"]',
        description: 'Focus on the job title search field',
        fallback: {
          action: 'click',
          target: 'input.jobs-search-box__text-input',
        },
      },
      {
        index: 2,
        action: 'type',
        target: 'input[aria-label="Search by title, skill, or company"]',
        value: jobTitle,
        description: `Type job title: ${jobTitle}`,
        fallback: {
          action: 'type',
          target: 'input.jobs-search-box__text-input',
          value: jobTitle,
        },
      },
      ...(location
        ? [
            {
              index: 3,
              action: 'click',
              target: 'input[aria-label="City, state, or zip code"]',
              description: 'Focus on the location search field',
              fallback: {
                action: 'click',
                target: 'input.jobs-search-box__text-input--location',
              },
            },
            {
              index: 4,
              action: 'type',
              target: 'input[aria-label="City, state, or zip code"]',
              value: location,
              description: `Enter location: ${location}`,
              fallback: {
                action: 'type',
                target: 'input.jobs-search-box__text-input--location',
                value: location,
              },
            },
          ]
        : []),
      {
        index: location ? 5 : 3,
        action: 'click',
        target: 'button.jobs-search-box__submit-button',
        description: 'Submit the job search',
        waitCondition: { type: 'networkIdle', value: 3000 },
        fallback: { action: 'keyPress', value: 'Enter' },
      },
      {
        index: location ? 6 : 4,
        action: 'click',
        target: 'button[aria-label="Easy Apply filter."]',
        description: 'Filter results to show only Easy Apply jobs',
        waitCondition: { type: 'networkIdle', value: 2000 },
        fallback: {
          action: 'click',
          target: 'button[data-control-name="f_LF_f_AL"]',
        },
      },
      ...(experienceLevel
        ? [
            {
              index: location ? 7 : 5,
              action: 'click',
              target: 'button[aria-label="Experience Level filter"]',
              description: 'Open experience level filter',
            },
            {
              index: location ? 8 : 6,
              action: 'click',
              target: `label[for*="${experienceLevel.toLowerCase()}"]`,
              description: `Select experience level: ${experienceLevel}`,
              waitCondition: { type: 'networkIdle', value: 1500 },
            },
          ]
        : []),
      {
        index: location || experienceLevel ? 9 : 5,
        action: 'click',
        target: '.jobs-search-results__list-item:first-child',
        description: 'Click the first job listing in the results',
        waitCondition: { type: 'domElement', value: '.jobs-unified-top-card' },
        fallback: {
          action: 'click',
          target: 'ul.jobs-search-results__list li:first-child a',
        },
      },
      {
        index: location || experienceLevel ? 10 : 6,
        action: 'click',
        target: 'button.jobs-apply-button',
        description: 'Click the Easy Apply button to start the application',
        waitCondition: {
          type: 'domElement',
          value: 'div.jobs-easy-apply-modal',
        },
        fallback: {
          action: 'click',
          target: 'button[aria-label*="Easy Apply"]',
        },
      },
      {
        index: location || experienceLevel ? 11 : 7,
        action: 'fillForm',
        target: 'div.jobs-easy-apply-modal form',
        description:
          'Fill in any required form fields in the first step of the application (phone, resume selection, etc.)',
        waitCondition: { type: 'timeout', value: 1000 },
      },
      {
        index: location || experienceLevel ? 12 : 8,
        action: 'click',
        target: 'button[aria-label="Continue to next step"]',
        description: 'Proceed to the next step of the application form',
        waitCondition: { type: 'timeout', value: 1500 },
        fallback: {
          action: 'click',
          target: 'button.artdeco-button--primary[type="button"]',
        },
      },
      {
        index: location || experienceLevel ? 13 : 9,
        action: 'fillForm',
        target: 'div.jobs-easy-apply-modal form',
        description:
          'Fill in additional form fields such as work authorization, salary expectations, or screening questions',
        waitCondition: { type: 'timeout', value: 1000 },
      },
      {
        index: location || experienceLevel ? 14 : 10,
        action: 'click',
        target: 'button[aria-label="Review your application"]',
        description: 'Navigate to the review page before final submission',
        waitCondition: { type: 'timeout', value: 1500 },
        fallback: {
          action: 'click',
          target: 'button.artdeco-button--primary[aria-label*="Review"]',
        },
      },
      {
        index: location || experienceLevel ? 15 : 11,
        action: 'click',
        target: 'button[aria-label="Submit application"]',
        description:
          'Submit the job application — this is the final irreversible action',
        requiresApproval: true,
        waitCondition: { type: 'networkIdle', value: 3000 },
        fallback: {
          action: 'click',
          target: 'button.artdeco-button--primary[aria-label*="Submit"]',
        },
      },
    ];

    // Normalize step indices to be sequential
    const normalizedSteps = steps.map((step, i) => ({ ...step, index: i }));

    return {
      goal: `Apply for ${jobTitle} jobs on LinkedIn${location ? ` in ${location}` : ''}`,
      steps: normalizedSteps,
      totalSteps: normalizedSteps.length,
      estimatedDuration: 180,
    };
  }
}
