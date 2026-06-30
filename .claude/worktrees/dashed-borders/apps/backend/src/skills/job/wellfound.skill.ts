import { ParsedGoal } from '../../agent/goal-understanding.service';
import { AgentPlan } from '../../shared/interfaces/agent.interfaces';
import { DomainSkill } from '../skill.interface';

export class WellfoundSkill implements DomainSkill {
  readonly name = 'wellfound-apply';
  readonly category = 'job';
  readonly supportedDomains = ['wellfound.com', 'angel.co'];

  canHandle(goal: ParsedGoal): boolean {
    if (goal.taskType !== 'job_search') return false;

    const intentLower = goal.intent.toLowerCase();
    const sites = goal.preferredWebsites.map((s) => s.toLowerCase());

    return (
      sites.some((s) => s.includes('wellfound') || s.includes('angellist')) ||
      intentLower.includes('wellfound') ||
      intentLower.includes('startup')
    );
  }

  buildPlan(goal: ParsedGoal): any {
    const jobTitle: string =
      goal.entities?.jobTitle ?? goal.entities?.role ?? 'Full Stack Engineer';
    const location: string | undefined =
      goal.entities?.location ?? goal.entities?.city;
    const remote: boolean =
      goal.entities?.remote ??
      goal.intent.toLowerCase().includes('remote') ??
      false;
    const startupStage: string | undefined = goal.entities?.startupStage;
    const equityMin: string | undefined = goal.entities?.equityMin;

    const steps = [
      {
        index: 0,
        action: 'navigate',
        target: 'https://wellfound.com/jobs',
        description: 'Navigate to Wellfound (formerly AngelList Talent) Jobs page',
        waitCondition: { type: 'networkIdle', value: 3000 },
      },
      {
        index: 1,
        action: 'click',
        target: 'input[placeholder*="Job title"]',
        description: 'Click on the role/job title search field',
        fallback: {
          action: 'click',
          target: 'input[data-test="role-input"]',
        },
      },
      {
        index: 2,
        action: 'type',
        target: 'input[placeholder*="Job title"]',
        value: jobTitle,
        description: `Type the target job title: ${jobTitle}`,
        fallback: {
          action: 'type',
          target: 'input[data-test="role-input"]',
          value: jobTitle,
        },
      },
      {
        index: 3,
        action: 'click',
        target: 'input[placeholder*="Location"]',
        description: 'Click on the location filter field',
        fallback: {
          action: 'click',
          target: 'input[data-test="location-input"]',
        },
      },
      {
        index: 4,
        action: 'type',
        target: 'input[placeholder*="Location"]',
        value: remote ? 'Remote' : (location ?? 'Anywhere'),
        description: `Set location preference: ${remote ? 'Remote' : (location ?? 'Anywhere')}`,
        fallback: {
          action: 'type',
          target: 'input[data-test="location-input"]',
          value: remote ? 'Remote' : (location ?? 'Anywhere'),
        },
      },
      ...(startupStage
        ? [
            {
              index: 5,
              action: 'click',
              target: 'div[data-test="stage-filter"]',
              description: 'Open the startup stage filter dropdown',
              waitCondition: { type: 'timeout', value: 800 },
            },
            {
              index: 6,
              action: 'click',
              target: `label[for*="${startupStage.toLowerCase()}"]`,
              description: `Select startup stage: ${startupStage}`,
              waitCondition: { type: 'networkIdle', value: 1500 },
            },
          ]
        : []),
      ...(equityMin
        ? [
            {
              index: startupStage ? 7 : 5,
              action: 'click',
              target: 'div[data-test="equity-filter"]',
              description: 'Open the equity filter to filter by minimum equity',
              waitCondition: { type: 'timeout', value: 800 },
            },
            {
              index: startupStage ? 8 : 6,
              action: 'click',
              target: `label[for*="${equityMin}"]`,
              description: `Set minimum equity filter: ${equityMin}`,
              waitCondition: { type: 'networkIdle', value: 1500 },
            },
          ]
        : []),
      {
        index: startupStage || equityMin ? (startupStage && equityMin ? 9 : 7) : 5,
        action: 'click',
        target: 'button[data-test="search-submit"]',
        description: 'Apply filters and search for matching startup jobs',
        waitCondition: { type: 'networkIdle', value: 3000 },
        fallback: { action: 'keyPress', value: 'Enter' },
      },
      {
        index: startupStage || equityMin ? (startupStage && equityMin ? 10 : 8) : 6,
        action: 'click',
        target: 'div[data-test="job-listing"]:first-child',
        description: 'Click on the first job listing to view full details',
        waitCondition: {
          type: 'domElement',
          value: 'div[data-test="job-detail"]',
        },
        fallback: {
          action: 'click',
          target: 'a[data-test="startup-job-link"]:first-child',
        },
      },
      {
        index: startupStage || equityMin ? (startupStage && equityMin ? 11 : 9) : 7,
        action: 'scroll',
        target: 'div[data-test="job-detail"]',
        description:
          'Read through the job description, required skills, and compensation details',
        waitCondition: { type: 'timeout', value: 1000 },
      },
      {
        index: startupStage || equityMin ? (startupStage && equityMin ? 12 : 10) : 8,
        action: 'click',
        target: 'button[data-test="apply-button"]',
        description:
          'Click the Apply button to begin the Wellfound application flow',
        waitCondition: { type: 'networkIdle', value: 3000 },
        fallback: {
          action: 'click',
          target: 'a[data-test="job-apply-btn"]',
        },
      },
      {
        index: startupStage || equityMin ? (startupStage && equityMin ? 13 : 11) : 9,
        action: 'fillForm',
        target: 'form[data-test="application-form"]',
        description:
          'Fill in your Wellfound profile details: years of experience, desired salary, and a personalized introduction note to the startup',
        waitCondition: { type: 'timeout', value: 1500 },
      },
      {
        index: startupStage || equityMin ? (startupStage && equityMin ? 14 : 12) : 10,
        action: 'type',
        target: 'textarea[data-test="cover-note"]',
        value: `I am excited about this ${jobTitle} opportunity at your startup. My experience aligns well with your technical requirements and I am enthusiastic about contributing to your mission.`,
        description: 'Write a personalized cover note tailored to the startup',
        waitCondition: { type: 'timeout', value: 500 },
      },
      {
        index: startupStage || equityMin ? (startupStage && equityMin ? 15 : 13) : 11,
        action: 'click',
        target: 'button[data-test="submit-application"]',
        description:
          'Submit the startup job application — final irreversible step requiring approval',
        requiresApproval: true,
        waitCondition: { type: 'networkIdle', value: 3000 },
        fallback: {
          action: 'click',
          target: 'button.application-submit-btn',
        },
      },
    ];

    const normalizedSteps = steps.map((step, i) => ({ ...step, index: i }));

    return {
      goal: `Apply for ${jobTitle} startup jobs on Wellfound${location ? ` in ${location}` : ''}${remote ? ' (Remote)' : ''}`,
      steps: normalizedSteps,
      totalSteps: normalizedSteps.length,
      estimatedDuration: 170,
    };
  }
}
