import { ParsedGoal } from '../../agent/goal-understanding.service';
import { AgentPlan } from '../../shared/interfaces/agent.interfaces';
import { DomainSkill } from '../skill.interface';

export class IndeedSkill implements DomainSkill {
  readonly name = 'indeed-apply';
  readonly category = 'job';
  readonly supportedDomains = ['indeed.com', 'in.indeed.com'];

  canHandle(goal: ParsedGoal): boolean {
    if (goal.taskType !== 'job_search') return false;

    const intentLower = goal.intent.toLowerCase();
    const sites = goal.preferredWebsites.map((s) => s.toLowerCase());

    return (
      sites.some((s) => s.includes('indeed')) ||
      intentLower.includes('indeed')
    );
  }

  buildPlan(goal: ParsedGoal): any {
    const jobTitle: string =
      goal.entities?.jobTitle ?? goal.entities?.role ?? 'Software Engineer';
    const location: string =
      goal.entities?.location ?? goal.entities?.city ?? 'Remote';
    const remote: boolean =
      goal.entities?.remote ??
      goal.intent.toLowerCase().includes('remote') ??
      false;
    const salaryMin: string | undefined = goal.entities?.salaryMin;

    const steps = [
      {
        index: 0,
        action: 'navigate',
        target: 'https://www.indeed.com',
        description: 'Navigate to Indeed homepage',
        waitCondition: { type: 'networkIdle', value: 3000 },
      },
      {
        index: 1,
        action: 'click',
        target: 'input[id="text-input-what"]',
        description: 'Click the "What" (job title/keyword) search field',
        fallback: {
          action: 'click',
          target: 'input[name="q"]',
        },
      },
      {
        index: 2,
        action: 'type',
        target: 'input[id="text-input-what"]',
        value: jobTitle,
        description: `Enter the job title or keywords: ${jobTitle}`,
        fallback: {
          action: 'type',
          target: 'input[name="q"]',
          value: jobTitle,
        },
      },
      {
        index: 3,
        action: 'click',
        target: 'input[id="text-input-where"]',
        description: 'Click the "Where" (location) search field',
        fallback: {
          action: 'click',
          target: 'input[name="l"]',
        },
      },
      {
        index: 4,
        action: 'type',
        target: 'input[id="text-input-where"]',
        value: remote ? 'Remote' : location,
        description: `Enter the location: ${remote ? 'Remote' : location}`,
        fallback: {
          action: 'type',
          target: 'input[name="l"]',
          value: remote ? 'Remote' : location,
        },
      },
      {
        index: 5,
        action: 'click',
        target: 'button[type="submit"].yosegi-InlineWhatWhere-primaryButton',
        description: 'Click Search to find matching Indeed jobs',
        waitCondition: { type: 'networkIdle', value: 3000 },
        fallback: { action: 'keyPress', value: 'Enter' },
      },
      ...(salaryMin
        ? [
            {
              index: 6,
              action: 'click',
              target: 'button[id="filter-salestimate"]',
              description: 'Open the salary filter',
              waitCondition: { type: 'timeout', value: 1000 },
            },
            {
              index: 7,
              action: 'click',
              target: `label[for*="${salaryMin}"]`,
              description: `Select minimum salary filter: ${salaryMin}`,
              waitCondition: { type: 'networkIdle', value: 2000 },
            },
          ]
        : []),
      {
        index: salaryMin ? 8 : 6,
        action: 'click',
        target: 'div.job_seen_beacon:first-child h2 a',
        description:
          'Click the first job result to open the job detail page or panel',
        waitCondition: {
          type: 'domElement',
          value: '.jobsearch-JobComponent',
        },
        fallback: {
          action: 'click',
          target: '.resultContent:first-child a.jcs-JobTitle',
        },
      },
      {
        index: salaryMin ? 9 : 7,
        action: 'scroll',
        target: '.jobsearch-JobComponent-description',
        description: 'Scroll through the job description to review requirements',
        waitCondition: { type: 'timeout', value: 1000 },
      },
      {
        index: salaryMin ? 10 : 8,
        action: 'click',
        target: 'button[id="indeedApplyButton"]',
        description: 'Click the "Apply now" or "Easily Apply" button',
        waitCondition: { type: 'networkIdle', value: 3000 },
        fallback: {
          action: 'click',
          target: 'a[id="applyButtonLinkContainer"] button',
        },
      },
      {
        index: salaryMin ? 11 : 9,
        action: 'fillForm',
        target: 'div.ia-BasePage-content form',
        description:
          'Fill in contact information and resume selection on the Indeed application form',
        waitCondition: { type: 'timeout', value: 1200 },
      },
      {
        index: salaryMin ? 12 : 10,
        action: 'click',
        target: 'button[data-testid="ia-continueButton"]',
        description: 'Click Continue to advance through the application steps',
        waitCondition: { type: 'networkIdle', value: 2000 },
        fallback: {
          action: 'click',
          target: 'button.ia-continueButton',
        },
      },
      {
        index: salaryMin ? 13 : 11,
        action: 'fillForm',
        target: 'div.ia-BasePage-content form',
        description:
          'Fill in qualifications, work experience, or screening questions on the next step',
        waitCondition: { type: 'timeout', value: 1000 },
      },
      {
        index: salaryMin ? 14 : 12,
        action: 'click',
        target: 'button[data-testid="ia-continueButton"]',
        description: 'Click Continue to reach the review and submit page',
        waitCondition: { type: 'networkIdle', value: 2000 },
        fallback: {
          action: 'click',
          target: 'button.ia-continueButton',
        },
      },
      {
        index: salaryMin ? 15 : 13,
        action: 'click',
        target: 'button[data-testid="ia-ReviewAndSubmit-submitBtn"]',
        description:
          'Submit the application — this is the final irreversible step',
        requiresApproval: true,
        waitCondition: { type: 'networkIdle', value: 3000 },
        fallback: {
          action: 'click',
          target: 'button.ia-SubmitButton',
        },
      },
    ];

    const normalizedSteps = steps.map((step, i) => ({ ...step, index: i }));

    return {
      goal: `Apply for ${jobTitle} jobs on Indeed in ${remote ? 'Remote' : location}`,
      steps: normalizedSteps,
      totalSteps: normalizedSteps.length,
      estimatedDuration: 160,
    };
  }
}
