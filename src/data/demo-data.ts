import type { AppUserData } from '../types';

/**
 * Static demo data for read-only portfolio demo mode.
 * Psychology of Decision-Making research project — no mutations, no persistence.
 */
export const DEMO_DATA: AppUserData = {
  version: 3,
  themes: [
    {
      id: 'biases-heuristics',
      theme: 'Cognitive Biases & Heuristics',
      color: '#E85D3A',
      icon: 'brain',
      description:
        'How systematic errors in thinking — anchoring, availability, framing — shape judgments and can be mitigated through awareness and design.',
      questions: [
        {
          id: 'biases-0',
          q: 'How does anchoring bias interact with domain expertise? Do experts resist irrelevant anchors better than novices, or are they equally susceptible?',
          why: 'Tversky & Kahneman\'s original work (1974) used general knowledge questions, but real-world decisions involve trained professionals. If experts are also anchored, interventions need to target the mechanism itself, not just education.',
          appImplication: 'If expertise doesn\'t protect against anchoring, debiasing tools need to be structural (e.g., forcing independent estimates before seeing reference points) rather than educational.',
          tags: ['anchoring', 'expertise', 'debiasing'],
          sources: [
            { text: 'Tversky & Kahneman (1974) — Science', doi: '10.1126/science.185.4157.1124' },
            { text: 'Furnham & Boo (2011) — J. Socio-Economics', doi: '10.1016/j.socec.2010.10.008' },
          ],
        },
        {
          id: 'biases-1',
          q: 'To what extent does the availability heuristic drive risk perception in media-saturated environments, and can structured information formats counteract it?',
          why: 'People overestimate risks they see in the news (terrorism, plane crashes) and underestimate common ones (heart disease, car accidents). This has downstream effects on policy support and personal decision-making.',
          appImplication: 'Risk communication formats should present base rates prominently alongside vivid narratives to counterbalance availability effects.',
          tags: ['availability heuristic', 'risk perception', 'media effects'],
          sources: [
            { text: 'Slovic et al. (2004) — Risk Analysis', doi: '10.1111/j.0272-4332.2004.00433.x' },
          ],
        },
        {
          id: 'biases-2',
          q: 'Can "consider the opposite" instructions reliably reduce confirmation bias in information search, or do they merely shift the direction of bias?',
          why: 'Lord, Lepper & Preston (1984) showed that asking people to consider the opposite reduced biased assimilation of evidence. But replication attempts show mixed results — sometimes people just anchor on the opposite instead.',
          appImplication: 'Debiasing interventions should be tested for genuine belief updating, not just attitude reversal.',
          tags: ['confirmation bias', 'debiasing', 'belief updating'],
          sources: [
            { text: 'Lord, Lepper & Preston (1984) — J. Personality & Social Psychology', doi: '10.1037/0022-3514.47.6.1231' },
          ],
        },
      ],
    },
    {
      id: 'choice-architecture',
      theme: 'Choice Architecture & Nudge Theory',
      color: '#7B61FF',
      icon: 'lightbulb',
      description:
        'How the structure of decision environments — defaults, framing, option ordering — shapes behavior without restricting freedom of choice.',
      questions: [
        {
          id: 'choice-0',
          q: 'Under what conditions do default effects persist over time? Do people who were nudged into a choice eventually opt out at higher rates than those who actively chose?',
          why: 'Defaults are the most powerful nudge, but if their effects decay as people revisit decisions, the long-term policy impact is weaker than initial studies suggest.',
          appImplication: 'Longitudinal tracking of default-driven decisions is essential before scaling nudge-based policies.',
          tags: ['defaults', 'persistence', 'policy evaluation'],
          sources: [
            { text: 'Johnson & Goldstein (2003) — Science', doi: '10.1126/science.1091721' },
            { text: 'Jachimowicz et al. (2019) — Behavioral & Brain Sciences', doi: '10.1017/S0140525X18002211' },
          ],
        },
        {
          id: 'choice-1',
          q: 'How does choice overload interact with decision importance? Are people more or less likely to defer when the stakes are higher and options are numerous?',
          why: 'Iyengar & Lepper (2000) showed choice overload with jam, but healthcare and financial decisions involve far more options with far higher stakes. The interaction between stakes and option quantity is underexplored.',
          appImplication: 'High-stakes decision tools should curate options aggressively rather than presenting exhaustive lists.',
          tags: ['choice overload', 'decision importance', 'option curation'],
          sources: [
            { text: 'Iyengar & Lepper (2000) — J. Personality & Social Psychology', doi: '10.1037/0022-3514.79.6.995' },
            { text: 'Chernev et al. (2015) — J. Consumer Psychology', doi: '10.1016/j.jcps.2014.08.002' },
          ],
        },
        {
          id: 'choice-2',
          q: 'What are the ethical boundaries of nudging? When does "libertarian paternalism" cross into manipulation, and how should transparency requirements be structured?',
          why: 'Thaler & Sunstein argue nudges preserve freedom of choice, but critics like Hausman & Welch point out that non-transparent nudges bypass rational agency. This has direct implications for informed consent in behavioral interventions.',
          appImplication: 'Any nudge-based system should include transparency mechanisms that let users see and override the architecture shaping their choices.',
          tags: ['ethics', 'autonomy', 'transparency'],
          sources: [
            { text: 'Thaler & Sunstein (2008) — Nudge (book)', doi: null },
            { text: 'Hausman & Welch (2010) — J. Political Philosophy', doi: '10.1111/j.1467-9760.2009.00351.x' },
          ],
        },
      ],
    },
    {
      id: 'emotion-risk',
      theme: 'Emotion, Risk & Uncertainty',
      color: '#2ECC71',
      icon: 'zap',
      description:
        'How affective states — fear, regret anticipation, mood — systematically alter probability weighting, risk tolerance, and decision quality.',
      questions: [
        {
          id: 'emotion-0',
          q: 'Does the affect heuristic operate independently of cognitive load, or does increased load amplify reliance on emotional signals for judgment?',
          why: 'Slovic\'s affect heuristic proposes that feelings serve as a mental shortcut for complex judgments. If cognitive load amplifies this, time-pressured professionals (doctors, traders) may be especially vulnerable.',
          appImplication: 'Decision support tools for high-load environments should externalize risk information rather than relying on users\' intuitive assessments.',
          tags: ['affect heuristic', 'cognitive load', 'professional decisions'],
          sources: [
            { text: 'Slovic et al. (2007) — European J. Operational Research', doi: '10.1016/j.ejor.2005.04.006' },
          ],
        },
        {
          id: 'emotion-1',
          q: 'How does anticipated regret shape decision-making differently from experienced regret? Are people accurate in predicting what they will regret?',
          why: 'Zeelenberg & Pieters (2007) argue that anticipated regret is a distinct decision input, not just a forecast of experienced regret. If people systematically mispredict regret, regret-avoidance strategies may be self-defeating.',
          appImplication: 'Pre-decision tools that ask "will you regret this?" may backfire if anticipated regret is miscalibrated.',
          tags: ['regret', 'affective forecasting', 'decision quality'],
          sources: [
            { text: 'Zeelenberg & Pieters (2007) — Social & Personality Psychology Compass', doi: '10.1111/j.1751-9004.2007.00004.x' },
          ],
        },
      ],
    },
    {
      id: 'social-influence',
      theme: 'Social Influence & Group Decisions',
      color: '#F39C12',
      icon: 'orbit',
      description:
        'How social proof, conformity pressure, and group dynamics amplify or distort individual judgment — from wisdom of crowds to groupthink.',
      questions: [
        {
          id: 'social-0',
          q: 'Under what conditions does the "wisdom of crowds" break down? How does information sharing within groups degrade aggregate accuracy?',
          why: 'Surowiecki (2004) showed crowds can be remarkably accurate, but Lorenz et al. (2011) demonstrated that even minimal social influence collapses the diversity of estimates that makes crowds wise.',
          appImplication: 'Group forecasting tools should collect independent estimates before sharing, and weight diverse outliers rather than discarding them.',
          tags: ['wisdom of crowds', 'information cascades', 'forecasting'],
          sources: [
            { text: 'Lorenz et al. (2011) — PNAS', doi: '10.1073/pnas.1008636108' },
          ],
        },
        {
          id: 'social-1',
          q: 'Does social proof operate differently in digital environments than in physical ones? How do online review counts and ratings shape decision processes compared to in-person recommendations?',
          why: 'Classic social proof research (Cialdini, 2001) was conducted in physical settings. Digital environments change the scale, anonymity, and verifiability of social signals. The transfer may not be straightforward.',
          appImplication: 'Digital social proof systems should distinguish between quantity signals (review count) and quality signals (reviewer credibility) to avoid herding effects.',
          tags: ['social proof', 'digital behavior', 'online reviews'],
          sources: [
            { text: 'Cialdini (2001) — Influence: Science and Practice', doi: null },
            { text: 'Muchnik et al. (2013) — Science', doi: '10.1126/science.1240466' },
          ],
        },
        {
          id: 'social-2',
          q: 'Can structured dissent protocols (like "red teaming") reliably prevent groupthink in organizational decision-making?',
          why: 'Janis (1972) identified groupthink in policy disasters (Bay of Pigs, Challenger). Red teaming is widely recommended but empirical evidence for its effectiveness is surprisingly thin.',
          appImplication: 'Organizations should rigorously evaluate whether their dissent protocols actually change outcomes, not just whether they feel psychologically safe.',
          tags: ['groupthink', 'red teaming', 'organizational decisions'],
          sources: [
            { text: 'Janis (1972) — Victims of Groupthink', doi: null },
            { text: 'Schweiger et al. (1989) — Academy of Management Journal', doi: '10.5465/256172' },
          ],
        },
      ],
    },
    {
      id: 'neuroeconomics',
      theme: 'Neuroeconomics & Computational Models',
      color: '#3498DB',
      icon: 'cpu',
      description:
        'How neural reward circuits, dopaminergic prediction errors, and computational models of choice illuminate the biological substrate of decision-making.',
      questions: [
        {
          id: 'neuro-0',
          q: 'How well do reinforcement learning models (reward prediction error) account for real-world decisions where outcomes are delayed, ambiguous, or socially mediated?',
          why: 'Lab studies of RPE use simple gambles with immediate feedback. Real decisions involve delayed outcomes (career choices), ambiguous rewards (relationship decisions), and social valuation (status). The ecological validity gap is significant.',
          appImplication: 'Computational decision models need validation against naturalistic decision data, not just lab gambling tasks.',
          tags: ['reward prediction error', 'ecological validity', 'reinforcement learning'],
          sources: [
            { text: 'Glimcher (2011) — Foundations of Neuroeconomic Analysis', doi: null },
            { text: 'Schultz et al. (1997) — Science', doi: '10.1126/science.275.5306.1593' },
          ],
        },
        {
          id: 'neuro-1',
          q: 'What is the role of the prefrontal cortex in overriding habitual choices? Can this capacity be trained or enhanced through targeted interventions?',
          why: 'Dual-process models (Kahneman\'s System 1/System 2) map loosely onto subcortical vs. prefrontal circuits. If PFC-mediated override is trainable, it opens the door to cognitive training for better decision-making.',
          appImplication: 'Decision training programs should focus on strengthening deliberative override of automatic responses, not just teaching people about biases.',
          tags: ['prefrontal cortex', 'dual-process theory', 'cognitive training'],
          sources: [
            { text: 'Hare et al. (2009) — Science', doi: '10.1126/science.1165908' },
          ],
        },
      ],
    },
  ],

  questions: {
    // ── Cognitive Biases (exploring) ──
    'biases-0': {
      status: 'exploring',
      starred: true,
      notes: [
        {
          id: 'demo-note-1',
          content:
            'Furnham & Boo (2011) meta-analysis is key here. They found that **expertise reduces but does not eliminate** anchoring effects. Judges, real estate agents, and clinicians all show anchoring, just at lower magnitudes than naive participants.\n\nThis has a critical implication: you can\'t train your way out of anchoring. Structural interventions (hiding irrelevant numbers, forcing independent estimates) are necessary even for experts.',
          createdAt: '2026-01-15T14:30:00Z',
          updatedAt: '2026-01-15T14:30:00Z',
        },
        {
          id: 'demo-note-2',
          content:
            'Interesting distinction from Epley & Gilovich (2006): anchoring from **self-generated** anchors (your own first estimate) works via insufficient adjustment, while anchoring from **externally provided** anchors works via selective accessibility. Different mechanisms → may need different debiasing strategies.\n\nNeed to dig into whether the debiasing literature distinguishes between these two pathways.',
          createdAt: '2026-01-20T10:15:00Z',
          updatedAt: '2026-01-22T09:00:00Z',
        },
      ],
      userSources: [
        {
          id: 'demo-src-1',
          text: 'Epley & Gilovich (2006) — Anchoring-and-adjustment heuristic',
          doi: '10.1111/j.1467-9280.2006.01704.x',
          url: null,
          notes: 'Distinguishes self-generated vs. externally provided anchors. Different mechanisms → different interventions needed.',
          addedAt: '2026-01-16T11:00:00Z',
        },
      ],
      searchPhrases: [
        'anchoring bias expertise domain knowledge',
        'debiasing anchoring effects professionals',
        'anchoring heuristic real world decisions',
      ],
    },

    // ── Cognitive Biases Q2 (has_findings) ──
    'biases-1': {
      status: 'has_findings',
      starred: false,
      notes: [
        {
          id: 'demo-note-3',
          content:
            'Key synthesis from Slovic\'s risk perception work: the availability heuristic doesn\'t just make vivid risks *feel* bigger — it actually changes **policy preferences**. People who\'ve recently seen terrorism coverage support higher defense spending even when shown base rate data.\n\nThe "frequency format" intervention (presenting "1 in 10,000" instead of "0.01%") helps but doesn\'t fully counteract availability. Need to look into whether narrative + statistics combined outperforms either alone.',
          createdAt: '2026-02-01T16:45:00Z',
          updatedAt: '2026-02-01T16:45:00Z',
        },
      ],
      userSources: [],
    },

    // ── Cognitive Biases Q3 (exploring) ──
    'biases-2': {
      status: 'exploring',
      starred: false,
      notes: [
        {
          id: 'demo-note-4',
          content:
            'Lord, Lepper & Preston (1984) found "consider the opposite" reduced biased assimilation, but Mussweiler et al. (2000) showed the instruction sometimes just **reverses** the bias direction rather than eliminating it. The person anchors on the opposite scenario instead.\n\nMaybe the right intervention isn\'t "consider the opposite" but "consider *multiple alternatives*" — forcing divergent thinking rather than binary flipping.',
          createdAt: '2026-02-05T13:20:00Z',
          updatedAt: '2026-02-05T13:20:00Z',
        },
      ],
      userSources: [],
    },

    // ── Choice Architecture Q1 (has_findings) ──
    'choice-0': {
      status: 'has_findings',
      starred: true,
      notes: [
        {
          id: 'demo-note-5',
          content:
            'Jachimowicz et al. (2019) meta-analysis is the definitive source here. Default effects are **robust but heterogeneous**. Key moderators:\n\n1. **Endowment**: Defaults that give people something (opt-out organ donation) are stronger than defaults that take something away\n2. **Recommendation signal**: People interpret defaults as implicit recommendations, so trust in the choice architect matters\n3. **Effort asymmetry**: When opting out is costly (time, forms), defaults are stickier — but this edges toward manipulation\n\nThe persistence question needs more longitudinal data. Most studies measure behavior at one time point.',
          createdAt: '2026-02-10T09:30:00Z',
          updatedAt: '2026-02-12T14:00:00Z',
        },
        {
          id: 'demo-note-6',
          content:
            'Found a great quote from Johnson & Goldstein (2003): "The gap between opt-in and opt-out organ donation rates is not a gap in preferences — it is a gap in the psychological cost of action." This perfectly captures why defaults work: they exploit the asymmetry between action and inaction.',
          createdAt: '2026-02-12T14:05:00Z',
          updatedAt: '2026-02-12T14:05:00Z',
        },
      ],
      userSources: [],
      searchPhrases: [
        'default effects persistence longitudinal',
        'opt-out vs opt-in behavioral outcomes',
        'nudge default long-term effects',
      ],
    },

    // ── Emotion Q1 (concluded) ──
    'emotion-0': {
      status: 'concluded',
      starred: false,
      notes: [
        {
          id: 'demo-note-7',
          content:
            'Concluded: The evidence strongly supports that cognitive load **amplifies** reliance on the affect heuristic. Shiv & Fedorikhin (1999) showed that people under load chose cake over fruit more often — the affective impulse wins when deliberative resources are taxed.\n\n**Key takeaway for the thesis:** Decision support tools in high-load environments (emergency medicine, financial trading floors) should externalize probability information in simple visual formats rather than expecting users to compute risk rationally under pressure.',
          createdAt: '2026-02-15T11:00:00Z',
          updatedAt: '2026-02-18T10:30:00Z',
        },
      ],
      userSources: [],
    },

    // ── Social Influence Q1 (not_started, but has a note) ──
    'social-0': {
      status: 'not_started',
      starred: false,
      notes: [
        {
          id: 'demo-note-8',
          content:
            'Haven\'t started the deep dive yet, but flagging Lorenz et al. (2011) as the essential starting point. They showed that even *minimal* social influence (seeing others\' estimates) collapses the diversity of independent judgments that makes crowds wise. The mean doesn\'t change much, but the variance shrinks — which means the crowd loses its error-correcting power.\n\nThis has huge implications for prediction markets, polling aggregation, and any system that relies on independent inputs.',
          createdAt: '2026-02-20T08:15:00Z',
          updatedAt: '2026-02-20T08:15:00Z',
        },
      ],
      userSources: [],
    },
  },

  journal: [
    {
      id: 'demo-journal-1',
      content:
        'Big realization today: the "rational actor" model isn\'t just wrong — it\'s wrong in *predictable, systematic ways*. That\'s the whole insight of Kahneman & Tversky. And it means decision architecture isn\'t about making people rational; it\'s about designing environments that work *with* our predictable irrationality.\n\nThis reframes my entire thesis. I\'m not studying how to fix people. I\'m studying how to fix the environments people decide in.',
      createdAt: '2026-02-18T20:30:00Z',
      updatedAt: '2026-02-18T20:30:00Z',
      questionId: 'choice-0',
      themeId: 'choice-architecture',
      tags: ['thesis framing', 'choice architecture', 'insight'],
    },
    {
      id: 'demo-journal-2',
      content:
        'Reading Slovic\'s affect heuristic work alongside the anchoring literature and a pattern is emerging: both biases are strongest when people lack a strong prior. Anchoring works because you don\'t have your own number; availability works because you don\'t have your own risk estimate.\n\nThis suggests that one universal debiasing strategy might be: **force people to generate their own estimate before seeing any external information**. Pre-commitment as debiasing.',
      createdAt: '2026-02-10T15:45:00Z',
      updatedAt: '2026-02-10T15:45:00Z',
      questionId: 'biases-0',
      themeId: 'biases-heuristics',
      tags: ['anchoring', 'affect heuristic', 'synthesis'],
    },
    {
      id: 'demo-journal-3',
      content:
        'Met with Dr. Whitfield today about the ethics chapter. She pushed back hard on my framing of nudges as "benign." Her point: even transparent nudges shift behavior in ways people didn\'t consciously choose. The fact that you *can* opt out doesn\'t mean the default isn\'t doing work on you.\n\nShe recommended Hausman & Welch (2010) — adding it to the library. This is going to complicate my argument in a productive way.',
      createdAt: '2026-01-28T17:00:00Z',
      updatedAt: '2026-01-28T17:00:00Z',
      questionId: 'choice-2',
      themeId: 'choice-architecture',
      tags: ['advisor meeting', 'ethics', 'nudging'],
    },
    {
      id: 'demo-journal-4',
      content:
        'Spent the evening reading about reward prediction errors and realized how far the neuroeconomics literature is from the behavioral work. Schultz et al. (1997) showed dopamine neurons encode *prediction errors*, not rewards — but the behavioral literature still talks about "reward sensitivity" as if the brain tracks absolute values.\n\nIf I can bridge these two literatures in my thesis — showing how computational models of RPE map onto behavioral debiasing — that could be an original contribution.',
      createdAt: '2026-01-22T22:00:00Z',
      updatedAt: '2026-01-22T22:00:00Z',
      questionId: 'neuro-0',
      themeId: 'neuroeconomics',
      tags: ['neuroeconomics', 'synthesis', 'original contribution'],
    },
  ],

  library: [
    {
      id: 'demo-article-1',
      title: 'Judgment under uncertainty: Heuristics and biases',
      authors: ['Tversky, A.', 'Kahneman, D.'],
      year: 1974,
      journal: 'Science',
      doi: '10.1126/science.185.4157.1124',
      url: 'https://doi.org/10.1126/science.185.4157.1124',
      abstract:
        'This article describes three heuristics that are employed in making judgments under uncertainty: representativeness, availability, and anchoring and adjustment. These heuristics are highly economical and usually effective, but they lead to systematic and predictable errors.',
      notes:
        'The foundational paper. Everything in this research project traces back to these three heuristics. Essential for the lit review introduction.',
      excerpts: [
        {
          id: 'demo-excerpt-1',
          quote:
            'People rely on a limited number of heuristic principles which reduce the complex tasks of assessing probabilities and predicting values to simpler judgmental operations. In general, these heuristics are quite useful, but sometimes they lead to severe and systematic errors.',
          comment:
            'The key insight: heuristics aren\'t bugs in human cognition — they\'re features that occasionally misfire. This frames the entire field.',
          createdAt: '2026-01-16T10:00:00Z',
        },
        {
          id: 'demo-excerpt-2',
          quote:
            'In many situations, people make estimates by starting from an initial value that is adjusted to yield the final answer. The adjustments are typically insufficient, leading to biased final estimates.',
          comment: 'The anchoring mechanism in one sentence. Initial value → insufficient adjustment → bias.',
          createdAt: '2026-01-17T14:30:00Z',
        },
      ],
      linkedQuestions: ['biases-0', 'biases-1'],
      status: 'key-source',
      tags: ['heuristics', 'anchoring', 'foundational'],
      aiSummary:
        'This landmark paper introduced three cognitive heuristics that underlie human judgment under uncertainty:\n\n1. **Representativeness**: People judge probability by similarity to a prototype, ignoring base rates and sample size. A description that "sounds like" an engineer is judged as likely to be an engineer, regardless of the base rate of engineers in the population.\n\n2. **Availability**: People estimate frequency and probability by the ease with which examples come to mind. Dramatic events (plane crashes) feel more common than mundane ones (car accidents) because they\'re more mentally accessible.\n\n3. **Anchoring and adjustment**: People estimate quantities by starting from an initial anchor and adjusting — but adjustments are systematically insufficient. Even random anchors (spinning a wheel) influence subsequent numerical estimates.\n\nThe paper\'s core argument is that these heuristics are adaptive and usually accurate, but produce predictable, systematic errors in specific situations. This framework launched decades of research into cognitive biases and their implications for policy, medicine, law, and economics.',
      isOpenAccess: false,
      savedAt: '2026-01-15T14:00:00Z',
      updatedAt: '2026-01-17T14:30:00Z',
    },
    {
      id: 'demo-article-2',
      title: 'A meta-analytic review of the anchoring effect',
      authors: ['Furnham, A.', 'Boo, H.C.'],
      year: 2011,
      journal: 'Journal of Socio-Economics',
      doi: '10.1016/j.socec.2010.10.008',
      url: 'https://doi.org/10.1016/j.socec.2010.10.008',
      abstract:
        'This meta-analysis reviews anchoring effect studies across domains including law, real estate, and medicine, examining moderators such as expertise, anchor extremity, and cognitive ability.',
      notes:
        'Critical for the expertise question. Expertise reduces but doesn\'t eliminate anchoring. The effect size is smaller for experts but still significant.',
      excerpts: [
        {
          id: 'demo-excerpt-3',
          quote:
            'Domain expertise attenuated but did not eliminate anchoring effects. Experts showed smaller but still statistically significant anchoring, suggesting that knowledge-based correction is insufficient to fully counteract the bias.',
          comment: 'Direct answer to my main question: expertise helps but isn\'t a cure. Need structural interventions.',
          createdAt: '2026-02-01T17:00:00Z',
        },
      ],
      linkedQuestions: ['biases-0'],
      status: 'done',
      tags: ['anchoring', 'meta-analysis', 'expertise'],
      aiSummary: null,
      isOpenAccess: false,
      savedAt: '2026-01-20T09:00:00Z',
      updatedAt: '2026-02-01T17:00:00Z',
    },
    {
      id: 'demo-article-3',
      title: 'Risk as analysis and risk as feelings: Some thoughts about affect, reason, risk, and rationality',
      authors: ['Slovic, P.', 'Finucane, M.L.', 'Peters, E.', 'MacGregor, D.G.'],
      year: 2004,
      journal: 'Risk Analysis',
      doi: '10.1111/j.0272-4332.2004.00433.x',
      url: 'https://doi.org/10.1111/j.0272-4332.2004.00433.x',
      abstract:
        'This paper proposes that risk perception is driven by two parallel systems: an analytic system that uses probability and logic, and an experiential system that uses affect and imagery. The interaction between these systems shapes how people respond to hazards.',
      notes: 'Core paper for the affect heuristic. Risk = analysis + feelings. Both systems are always active.',
      excerpts: [],
      linkedQuestions: ['biases-1', 'emotion-0'],
      status: 'done',
      tags: ['affect heuristic', 'risk perception', 'dual process'],
      aiSummary: null,
      isOpenAccess: true,
      savedAt: '2026-02-05T12:00:00Z',
      updatedAt: '2026-02-05T13:20:00Z',
    },
    {
      id: 'demo-article-4',
      title: 'Do defaults save lives?',
      authors: ['Johnson, E.J.', 'Goldstein, D.G.'],
      year: 2003,
      journal: 'Science',
      doi: '10.1126/science.1091721',
      url: 'https://doi.org/10.1126/science.1091721',
      abstract:
        'This paper demonstrates that organ donation rates differ dramatically between countries with opt-in versus opt-out defaults, even among culturally similar nations, suggesting that default rules have a powerful effect on consequential real-world decisions.',
      notes:
        'The most compelling real-world demonstration of default effects. Organ donation rates: opt-in countries ~15%, opt-out countries ~90%. Same people, different defaults, radically different outcomes.',
      excerpts: [
        {
          id: 'demo-excerpt-4',
          quote:
            'The difference in donation rates between opt-in and opt-out countries is not primarily a reflection of differences in preferences, but rather a reflection of the power of the default.',
          comment: 'This is the quote that changed my thinking. Preferences didn\'t differ — the architecture did.',
          createdAt: '2026-02-10T10:00:00Z',
        },
      ],
      linkedQuestions: ['choice-0'],
      status: 'key-source',
      tags: ['defaults', 'organ donation', 'policy'],
      aiSummary: null,
      isOpenAccess: false,
      savedAt: '2026-02-10T08:00:00Z',
      updatedAt: '2026-02-12T14:00:00Z',
    },
    {
      id: 'demo-article-5',
      title: 'When and why defaults influence decisions: A meta-analysis of default effects',
      authors: ['Jachimowicz, J.M.', 'Duncan, S.', 'Weber, E.U.', 'Johnson, E.J.'],
      year: 2019,
      journal: 'Behavioural and Brain Sciences',
      doi: '10.1017/S0140525X18002211',
      url: 'https://doi.org/10.1017/S0140525X18002211',
      abstract:
        'This meta-analysis of 58 studies examines moderators of default effects, finding that defaults are strongest when they convey an implicit recommendation and when the cost of opting out is high.',
      notes: 'The definitive meta-analysis on defaults. Three moderators: endowment, recommendation, effort asymmetry.',
      excerpts: [],
      linkedQuestions: ['choice-0', 'choice-2'],
      status: 'reading',
      tags: ['defaults', 'meta-analysis', 'moderators'],
      aiSummary: null,
      isOpenAccess: false,
      savedAt: '2026-02-08T11:00:00Z',
      updatedAt: '2026-02-14T09:30:00Z',
    },
    {
      id: 'demo-article-6',
      title: 'The role of affect in decision making',
      authors: ['Slovic, P.', 'Peters, E.', 'Finucane, M.L.', 'MacGregor, D.G.'],
      year: 2007,
      journal: 'European Journal of Operational Research',
      doi: '10.1016/j.ejor.2005.04.006',
      url: 'https://doi.org/10.1016/j.ejor.2005.04.006',
      abstract:
        'This article reviews evidence that affect — the quality of goodness or badness experienced as a feeling state — acts as a cue for judgment and decision-making across a wide range of domains.',
      notes: 'Comprehensive review of the affect heuristic. Good for the thesis chapter on emotion and judgment.',
      excerpts: [],
      linkedQuestions: ['emotion-0'],
      status: 'done',
      tags: ['affect heuristic', 'emotion', 'judgment'],
      aiSummary: null,
      isOpenAccess: false,
      savedAt: '2026-02-14T16:00:00Z',
      updatedAt: '2026-02-15T11:00:00Z',
    },
    {
      id: 'demo-article-7',
      title: 'How social influence can undermine the wisdom of crowd effect',
      authors: ['Lorenz, J.', 'Rauhut, H.', 'Schweitzer, F.', 'Helbing, D.'],
      year: 2011,
      journal: 'Proceedings of the National Academy of Sciences',
      doi: '10.1073/pnas.1008636108',
      url: 'https://doi.org/10.1073/pnas.1008636108',
      abstract:
        'We demonstrate that even mild social influence can undermine the wisdom of crowd effect by reducing the diversity of individual estimates without improving accuracy.',
      notes: '',
      excerpts: [],
      linkedQuestions: ['social-0'],
      status: 'to-read',
      tags: ['wisdom of crowds', 'social influence', 'group decisions'],
      aiSummary: null,
      isOpenAccess: true,
      savedAt: '2026-02-20T08:30:00Z',
      updatedAt: '2026-02-20T08:30:00Z',
    },
    {
      id: 'demo-article-8',
      title: 'Libertarian paternalism is not an oxymoron',
      authors: ['Hausman, D.M.', 'Welch, B.'],
      year: 2010,
      journal: 'Journal of Political Philosophy',
      doi: '10.1111/j.1467-9760.2009.00351.x',
      url: 'https://doi.org/10.1111/j.1467-9760.2009.00351.x',
      abstract:
        'This paper critically examines the normative foundations of libertarian paternalism, arguing that while nudges preserve formal freedom of choice, they may undermine the substantive autonomy that makes freedom valuable.',
      notes: '',
      excerpts: [],
      linkedQuestions: ['choice-2'],
      status: 'to-read',
      tags: ['nudge ethics', 'autonomy', 'political philosophy'],
      aiSummary: null,
      isOpenAccess: false,
      savedAt: '2026-02-19T14:00:00Z',
      updatedAt: '2026-02-19T14:00:00Z',
    },
    {
      id: 'demo-article-9',
      title: 'Midbrain dopamine neurons signal a quantitative reward prediction error',
      authors: ['Schultz, W.', 'Dayan, P.', 'Montague, P.R.'],
      year: 1997,
      journal: 'Science',
      doi: '10.1126/science.275.5306.1593',
      url: 'https://doi.org/10.1126/science.275.5306.1593',
      abstract:
        'We show that the activity of midbrain dopamine neurons is consistent with the prediction error signal posited by temporal difference reinforcement learning models, providing a neural substrate for reward-based learning.',
      notes:
        'Foundational neuroeconomics paper. Dopamine neurons don\'t encode reward — they encode reward *prediction error*. This changes everything about how we think about decision learning.',
      excerpts: [],
      linkedQuestions: ['neuro-0'],
      status: 'done',
      tags: ['dopamine', 'reward prediction error', 'neuroscience'],
      aiSummary: null,
      isOpenAccess: true,
      savedAt: '2026-01-22T21:00:00Z',
      updatedAt: '2026-01-23T10:00:00Z',
    },
    {
      id: 'demo-article-10',
      title: 'Thinking, Fast and Slow',
      authors: ['Kahneman, D.'],
      year: 2011,
      journal: 'Farrar, Straus and Giroux',
      doi: null,
      url: null,
      abstract:
        'A comprehensive overview of decades of research on cognitive biases, dual-process theory, and the psychology of judgment and decision-making, written for a general audience by the Nobel laureate who pioneered the field.',
      notes:
        'The book that popularized the field. System 1 / System 2 framework is the lingua franca of decision-making research. Essential reference even though some findings haven\'t replicated cleanly.',
      excerpts: [
        {
          id: 'demo-excerpt-5',
          quote:
            'Nothing in life is as important as you think it is, while you are thinking about it.',
          comment: 'The focusing illusion in one sentence. Attention distorts valuation — directly relevant to choice architecture.',
          createdAt: '2026-02-08T15:00:00Z',
        },
      ],
      linkedQuestions: ['biases-0', 'biases-1', 'neuro-1'],
      status: 'key-source',
      tags: ['dual-process', 'System 1/2', 'foundational'],
      aiSummary: null,
      isOpenAccess: false,
      savedAt: '2026-02-08T14:00:00Z',
      updatedAt: '2026-02-08T15:00:00Z',
    },
  ],

  lastModified: '2026-02-20T08:30:00Z',
};
