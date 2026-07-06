// This file is a compile-time type conformance check. It has no runtime exports.
//
// Purpose: assert that every concrete DomainAgent subclass continues to satisfy
// the DomainAgent interface even when the interface gains new members.  Running
// `tsc --noEmit` (or the project's normal build) will fail here before any
// runtime code is affected if a class falls out of conformance.
//
// Pattern: `{} as ConcreteAgent satisfies DomainAgent` is a structural probe.
// The `satisfies` operator requires the left-hand expression to match the type
// without widening it, giving a precise error pointing to the missing member.

import { DomainAgent } from '../../domain-agent.interface';

import { BookingDomainAgent } from '../booking.agent';
import { EmailDomainAgent } from '../email.agent';
import { FileDomainAgent } from '../file.agent';
import { FinanceDomainAgent } from '../finance.agent';
import { FoodDomainAgent } from '../food.agent';
import { JobDomainAgent } from '../job.agent';
import { MediaDomainAgent } from '../media.agent';
import { ResearchDomainAgent } from '../research.agent';
import { ShoppingDomainAgent } from '../shopping.agent';
import { SocialDomainAgent } from '../social.agent';
import { TravelDomainAgent } from '../travel.agent';
import { CalendarDomainAgent } from '../calendar.agent';

/* eslint-disable @typescript-eslint/no-unused-vars */

const _booking: DomainAgent   = {} as BookingDomainAgent  satisfies DomainAgent;
const _calendar: DomainAgent  = {} as CalendarDomainAgent satisfies DomainAgent;
const _email: DomainAgent     = {} as EmailDomainAgent    satisfies DomainAgent;
const _file: DomainAgent      = {} as FileDomainAgent     satisfies DomainAgent;
const _finance: DomainAgent   = {} as FinanceDomainAgent  satisfies DomainAgent;
const _food: DomainAgent      = {} as FoodDomainAgent     satisfies DomainAgent;
const _job: DomainAgent       = {} as JobDomainAgent      satisfies DomainAgent;
const _media: DomainAgent     = {} as MediaDomainAgent    satisfies DomainAgent;
const _research: DomainAgent  = {} as ResearchDomainAgent satisfies DomainAgent;
const _shopping: DomainAgent  = {} as ShoppingDomainAgent satisfies DomainAgent;
const _social: DomainAgent    = {} as SocialDomainAgent   satisfies DomainAgent;
const _travel: DomainAgent    = {} as TravelDomainAgent   satisfies DomainAgent;

/* eslint-enable @typescript-eslint/no-unused-vars */
