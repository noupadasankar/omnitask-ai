import { ParsedGoal } from '../../agent/goal-understanding.service';
import { AgentPlan } from '../../shared/interfaces/agent.interfaces';
import { DomainSkill } from '../skill.interface';

export class NaukriSkill implements DomainSkill {
  readonly name = 'naukri-apply';
  readonly category = 'job';
  readonly supportedDomains = ['naukri.com', 'www.naukri.com'];

  canHandle(goal: ParsedGoal): boolean {
    if (goal.taskType !== 'job_search') return false;

    const intentLower = goal.intent.toLowerCase();
    const sites = goal.preferredWebsites.map((s) => s.toLowerCase());

    const isExplicitlyNaukri =
      sites.some((s) => s.includes('naukri')) ||
      intentLower.includes('naukri');

    const isDefaultIndianSite =
      !intentLower.includes('linkedin') &&
      !intentLower.includes('indeed') &&
      !intentLower.includes('wellfound') &&
      !sites.some(
        (s) =>
          s.includes('linkedin') ||
          s.includes('indeed') ||
          s.includes('wellfound'),
      );

    return isExplicitlyNaukri || isDefaultIndianSite;
  }

  buildPlan(goal: ParsedGoal): any {
    const jobTitle: string =
      goal.entities?.jobTitle ?? goal.entities?.role ?? 'Software Developer';
    const location: string =
      goal.entities?.location ?? goal.entities?.city ?? 'India';
    const experience: string | undefined = goal.entities?.experience;
    const skills: string | undefined = goal.entities?.skills;

    const steps = [
      {
        index: 0,
        action: 'navigate',
        target: 'https://www.naukri.com',
        description: 'Navigate to Naukri.com homepage',
        waitCondition: { type: 'networkIdle', value: 3000 },
      },
      {
        index: 1,
        action: 'click',
        target: 'input[placeholder*="Enter skills / designations / companies"]',
        description: 'Click on the job search input field',
        fallback: {
          action: 'click',
          target: 'input#qsb-keyword-sugg',
        },
      },
      {
        index: 2,
        action: 'type',
        target: 'input[placeholder*="Enter skills / designations / companies"]',
        value: jobTitle,
        description: `Type job title or skills: ${jobTitle}`,
        fallback: {
          action: 'type',
          target: 'input#qsb-keyword-sugg',
          value: jobTitle,
        },
      },
      {
        index: 3,
        action: 'click',
        target: 'input[placeholder*="Enter location"]',
        description: 'Click on the location input field',
        fallback: {
          action: 'click',
          target: 'input#qsb-location-sugg',
        },
      },
      {
        index: 4,
        action: 'type',
        target: 'input[placeholder*="Enter location"]',
        value: location,
        description: `Enter preferred location: ${location}`,
        fallback: {
          action: 'type',
          target: 'input#qsb-location-sugg',
          value: location,
        },
      },
      {
        index: 5,
        action: 'click',
        target: 'button[type="submit"].qsb-submit',
        description: 'Click the Search button to find matching jobs',
        waitCondition: { type: 'networkIdle', value: 3000 },
        fallback: { action: 'keyPress', value: 'Enter' },
      },
      ...(experience
        ? [
            {
              index: 6,
              action: 'click',
              target: 'span[data-type="experience"]',
              description: 'Open the experience filter panel',
              waitCondition: { type: 'timeout', value: 1000 },
            },
            {
              index: 7,
              action: 'click',
              target: `label[for*="${experience}"]`,
              description: `Select experience range: ${experience}`,
              waitCondition: { type: 'networkIdle', value: 2000 },
            },
          ]
        : []),
      {
        index: experience ? 8 : 6,
        action: 'click',
        target: 'article.jobTuple:first-child',
        description:
          'Click on the first job listing card to open the job details',
        waitCondition: {
          type: 'domElement',
          value: '.jd-header-title',
        },
        fallback: {
          action: 'click',
          target: '.list article:first-child a.title',
        },
      },
      {
        index: experience ? 9 : 7,
        action: 'scroll',
        target: '.jd-header-title',
        description: 'Scroll to the job detail panel header to review the role',
        waitCondition: { type: 'timeout', value: 800 },
      },
      {
        index: experience ? 10 : 8,
        action: 'click',
        target: 'button[id="apply-button"]',
        description: 'Click the Apply button on the job detail page',
        waitCondition: { type: 'networkIdle', value: 3000 },
        fallback: {
          action: 'click',
          target: 'a.apply-button',
        },
      },
      {
        index: experience ? 11 : 9,
        action: 'fillForm',
        target: 'form.naukri-apply-form',
        description:
          'Fill in any required fields on the Naukri application form (notice period, current CTC, expected CTC)',
        waitCondition: { type: 'timeout', value: 1000 },
      },
      {
        index: experience ? 12 : 10,
        action: 'click',
        target: 'button[id="continue-btn"]',
        description: 'Click Continue to proceed through multi-step application',
        waitCondition: { type: 'networkIdle', value: 2000 },
        fallback: {
          action: 'click',
          target: 'button.btn-dark-ot',
        },
      },
      {
        index: experience ? 13 : 11,
        action: 'fillForm',
        target: 'form.naukri-apply-form',
        description:
          'Fill in any additional screening questions or cover note if prompted',
        waitCondition: { type: 'timeout', value: 1000 },
      },
      {
        index: experience ? 14 : 12,
        action: 'click',
        target: 'button[id="submit-btn"]',
        description:
          'Submit the application — final irreversible step requiring approval',
        requiresApproval: true,
        waitCondition: { type: 'networkIdle', value: 3000 },
        fallback: {
          action: 'click',
          target: 'button.submit-button',
        },
      },
    ];

    const normalizedSteps = steps.map((step, i) => ({ ...step, index: i }));

    return {
      goal: `Apply for ${jobTitle} jobs on Naukri.com in ${location}`,
      steps: normalizedSteps,
      totalSteps: normalizedSteps.length,
      estimatedDuration: 150,
    };
  }
}
