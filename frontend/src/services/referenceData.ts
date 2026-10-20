import type { EmailMetadata, ThreadResponse } from './email';

export const REFERENCE_EMAILS: EmailMetadata[] = [
  {
    id: 'msg-john-smith-1',
    threadId: 'thread-john-smith-1',
    from: 'John Smith <john.smith@acmecorp.com>',
    to: 'Emily Davis <emily.davis@zenithtech.com>',
    date: '7:41',
    subject: "Request on additional information on 'Insight360'",
    snippet: 'John needs more details on CRM integration and pricing options based on usage or team sizes',
    is_unread: true,
    is_sent: false,
    ai_replied: false,
  },
  {
    id: 'msg-dominic-2',
    threadId: 'thread-dominic-2',
    from: 'Dominic Hirthe <dominic.h@ventures.io>',
    to: 'Emily Davis <emily.davis@zenithtech.com>',
    date: '7:33',
    subject: 'Urgent assistance needed: Request for help with wire transfer',
    snippet: 'Dominic urgently needs your assistance with a wire transfer. He asks for a short call ASAP.',
    is_unread: true,
    is_sent: false,
    ai_replied: false,
  },
  {
    id: 'msg-angelina-3',
    threadId: 'thread-angelina-3',
    from: 'Angelina Wilderman <angelina@growthlabs.co>',
    to: 'Emily Davis <emily.davis@zenithtech.com>',
    date: '7:10',
    subject: 'Lead gen strategy discussion',
    snippet: "Angelina's fresh lead gen strategy ready for presentation. Available today (Thu, 20 Jul) or tomorrow (Fri, 21 Jul) after noon. Suggest a time.",
    is_unread: false,
    is_sent: false,
    ai_replied: false,
  },
  {
    id: 'msg-gilberto-4',
    threadId: 'thread-gilberto-4',
    from: 'Gilberto Hackett <g.hackett@thesaurus.io>',
    to: 'Emily Davis <emily.davis@zenithtech.com>',
    date: 'Jul 27',
    subject: 'Project plan discussion @ Fri Jul 7, 2023 3pm - 4pm',
    snippet: 'The client wants to clarify project scope and discuss next steps. They suggested a call next week to explore customization options.',
    is_unread: false,
    is_sent: false,
    ai_replied: true,
  },
  {
    id: 'msg-rolando-5',
    threadId: 'thread-rolando-5',
    from: 'Rolando Rohan <rolando@medtechventures.com>',
    to: 'Emily Davis <emily.davis@zenithtech.com>',
    date: 'Jul 23',
    subject: 'New project lead - healthcare app',
    snippet: 'Hot lead needs a design and clickable prototype for web and mobile apps, with documentation for developers. 8-week deadline and $50,000 budget.',
    is_unread: false,
    is_sent: false,
    ai_replied: false,
  },
];

export const REFERENCE_THREADS: Record<string, ThreadResponse> = {
  'thread-john-smith-1': {
    thread_id: 'thread-john-smith-1',
    messages: [
      {
        id: 'msg-john-1',
        from: 'John Smith <john.smith@acmecorp.com>',
        to: 'Emily Davis <emily.davis@zenithtech.com>',
        date: 'Jun 6',
        subject: 'Inquiry on pricing and integration',
        body: `Hi Emily,

Hope you're fantastic! ✨ I've been diving into the 'Insight360' brochure and those case studies — wow, they're quite a game-changer! But, before I jump on board, I've got a couple of burning questions.

How does 'Insight360' play along with existing CRM systems? We're looking for a super-smooth integration. And, about pricing — any cool, flexible options for different scales of use or team sizes?

A detailed demo focusing on these hot topics would totally rock! 🚀

Eagerly waiting,
John Smith
IT Director, Acme Corp
john.smith@acmecorp.com`
      }
    ]
  }
};

export const REFERENCE_AI_SCENARIO_DATA = {
  summary: "John Smith from Acme Corp requests more information on how 'Insight360' integrates with existing CRM systems and asks about flexible pricing options based on usage or team sizes.",
  sentiment: "😄 Sounds enthusiastic.",
  scenarios: [
    "Suggest scheduling a demo",
    "Consult with the marketing team for a relevant case study"
  ],
  quickChip: "Attach pricing and features presentation",
  draftTitle: "Generate cases and pricing summary",
  draftBody: `Dear John,
Thank you for your interest! 'Insight360' integrates with a variety of CRM systems. To provide you overview of our offerings, I have attached a guide that details our flexible pricing plans and the integration features.

We would also like to invite you for a personalized demonstration of our platform. Please inform us of a suitable time for you.

Best regards,
Emily Davis
CEO, ZenithTech`,
  moreIdeas: [
    "Suggest a time to discuss project further",
    "Invite to tomorrow's webinar"
  ]
};
