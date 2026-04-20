import type { AllocationCategory, DayAllocation, GridRow } from '@/components/shared/allocation-grid'

// ── Projects ──────────────────────────────────────────────
export const projects = [
  { id: 'acme',       name: 'Acme Portal',     type: 'client' as AllocationCategory,   color: '#22c55e' },
  { id: 'bd',         name: 'BD Proposal',      type: 'client' as AllocationCategory,   color: '#16a34a' },
  { id: 'edu',        name: 'EduPlatform',      type: 'client' as AllocationCategory,   color: '#15803d' },
  { id: 'fintech',    name: 'FinTech App',      type: 'client' as AllocationCategory,   color: '#4ade80' },
  { id: 'health',     name: 'HealthCo CRM',     type: 'client' as AllocationCategory,   color: '#86efac' },
  { id: 'design',     name: 'Design System',    type: 'internal' as AllocationCategory, color: '#3b82f6' },
  { id: 'internal',   name: 'Internal Tools',   type: 'internal' as AllocationCategory, color: '#60a5fa' },
  { id: 'market',     name: 'Market Research',  type: 'internal' as AllocationCategory, color: '#2563eb' },
  { id: 'leaves',     name: 'Leaves',           type: 'leaves' as AllocationCategory,   color: '#ef4444' },
  { id: 'training',   name: 'Training (L&D)',   type: 'training' as AllocationCategory, color: '#8b5cf6' },
]

// ── Resources ─────────────────────────────────────────────
export const resources = [
  { id: 'AM',  name: 'Arjun Mehta',    role: 'Senior Developer',   grade: 'Senior Manager',   location: 'Mumbai',    region: 'Asia Pacific', color: '#f59e0b', subServiceLine: 'Frontend',    primarySkill: 'React',           skills: ['React', 'TypeScript', 'Next.js'] },
  { id: 'PS',  name: 'Priya Sharma',   role: 'UX Designer',        grade: 'Manager',          location: 'Mumbai',    region: 'Asia Pacific', color: '#8b5cf6', subServiceLine: 'Design',      primarySkill: 'Figma',           skills: ['Figma', 'UX Research', 'Prototyping'] },
  { id: 'RV',  name: 'Rahul Verma',    role: 'Project Manager',    grade: 'Director',         location: 'New York',  region: 'Americas',     color: '#3b82f6', subServiceLine: 'Delivery',    primarySkill: 'PMP',             skills: ['PMP', 'Agile', 'Stakeholder Mgmt'] },
  { id: 'SP',  name: 'Sneha Patel',    role: 'Business Analyst',   grade: 'Senior Associate', location: 'Singapore', region: 'Asia Pacific', color: '#22c55e', subServiceLine: 'Consulting',  primarySkill: 'Requirements',    skills: ['Requirements', 'SQL', 'Tableau'] },
  { id: 'KN',  name: 'Karthik Nair',   role: 'Backend Engineer',   grade: 'Senior Manager',   location: 'London',    region: 'EMEA',         color: '#06b6d4', subServiceLine: 'Engineering', primarySkill: 'Node.js',         skills: ['Node.js', 'Python', 'AWS'] },
  { id: 'DM',  name: 'Divya Menon',    role: 'Frontend Engineer',  grade: 'Associate',        location: 'Mumbai',    region: 'Asia Pacific', color: '#ec4899', subServiceLine: 'Frontend',    primarySkill: 'Vue.js',          skills: ['Vue.js', 'CSS', 'JavaScript'] },
  { id: 'VS',  name: 'Vikram Singh',   role: 'Data Scientist',     grade: 'Manager',          location: 'New York',  region: 'Americas',     color: '#f97316', subServiceLine: 'Analytics',   primarySkill: 'Machine Learning',skills: ['Machine Learning', 'Python', 'TensorFlow'] },
  { id: 'AK',  name: 'Arun Kumar',     role: 'Project Manager',    grade: 'Senior Associate', location: 'Singapore', region: 'Asia Pacific', color: '#14b8a6', subServiceLine: 'Delivery',    primarySkill: 'Scrum',           skills: ['Scrum', 'JIRA', 'Risk Mgmt'] },
  { id: 'SR',  name: 'Sanjay Rao',     role: 'Project Manager',    grade: 'Associate',        location: 'London',    region: 'EMEA',         color: '#64748b', subServiceLine: 'Delivery',    primarySkill: 'Agile',           skills: ['Agile', 'Confluence', 'MS Project'] },
  { id: 'PS2', name: 'Priya Sharma 2', role: 'Frontend Engineer',  grade: 'Senior Associate', location: 'Sydney',    region: 'Asia Pacific', color: '#a855f7', subServiceLine: 'Frontend',    primarySkill: 'Angular',         skills: ['Angular', 'TypeScript', 'RxJS'] },
]

// ── Day keys for week Mar 9-13, 2026 (Mon–Fri only) ──────
export const weekDays = [
  { key: 'mon9',  label: 'Mon', sublabel: '9 Mar' },
  { key: 'tue10', label: 'Tue', sublabel: '10 Mar' },
  { key: 'wed11', label: 'Wed', sublabel: '11 Mar' },
  { key: 'thu12', label: 'Thu', sublabel: '12 Mar' },
  { key: 'fri13', label: 'Fri', sublabel: '13 Mar' },
]

function a(id: string, label: string, cat: AllocationCategory, hours?: number, projectId?: string, resourceId?: string): DayAllocation {
  return { id: `${id}-${Math.random().toString(36).slice(2, 6)}`, label, category: cat, hours, projectId, resourceId }
}

// ── Resource View rows (what each person works on per day) ──
export function buildResourceViewRows(): GridRow[] {
  return [
    {
      id: 'AM', name: 'Arjun Mehta', subtitle: 'Senior Developer', avatar: 'AM', avatarColor: '#f59e0b', utilization: 53,
      days: {
        sun8:  [a('AM-train',  'Training (L&D)', 'training', 4, 'training'),   a('AM-design', 'Design System',  'internal', 4, 'design')],
        mon9:  [a('AM-design', 'Design System',  'internal', 4, 'design'),     a('AM-avail',  'Available',      'available')],
        tue10: [a('AM-fin',    'FinTech App',    'client', 6, 'fintech'),      a('AM-avail',  'Available',      'available')],
        wed11: [a('AM-acme',   'Acme Portal',    'client', 6, 'acme'),         a('AM-avail',  'Available',      'available')],
        thu12: [a('AM-market', 'Market Research','internal', 6, 'market'),     a('AM-avail',  'Available',      'available')],
        fri13: [a('AM-int',    'Internal Tools', 'internal', 6, 'internal'),   a('AM-avail',  'Available',      'available')],
        sat14: [a('AM-health', 'HealthCo CRM',   'client', 4, 'health'),      a('AM-edu',    'EduPlatform',    'client', 4, 'edu')],
      },
    },
    {
      id: 'PS', name: 'Priya Sharma', subtitle: 'UX Designer', avatar: 'PS', avatarColor: '#8b5cf6', utilization: 92,
      days: {
        sun8:  [a('PS-design', 'Design System',  'internal', 4, 'design'),     a('PS-train',  'Training (L&D)', 'training', 4, 'training'), a('PS-avail', 'Available', 'available')],
        mon9:  [a('PS-acme',   'Acme Portal',    'client', 6, 'acme'),         a('PS-avail',  'Available',      'available')],
        tue10: [a('PS-design', 'Design System',  'internal', 6, 'design'),     a('PS-avail',  'Available',      'available')],
        wed11: [a('PS-leaves', 'Leaves',         'leaves', 8, 'leaves'),       a('PS-avail',  'Available',      'available')],
        thu12: [a('PS-train',  'Training (L&D)', 'training', 8, 'training'),   a('PS-avail',  'Available',      'available')],
        fri13: [a('PS-health', 'HealthCo CRM',   'client', 4, 'health'),      a('PS-design', 'Design System',  'internal', 4, 'design')],
        sat14: [a('PS-train',  'Training (L&D)', 'training', 4, 'training'),   a('PS-train2', 'Training (L&D)', 'training', 4, 'training')],
      },
    },
    {
      id: 'RV', name: 'Rahul Verma', subtitle: 'Project Manager', avatar: 'RV', avatarColor: '#3b82f6', utilization: 63,
      days: {
        sun8:  [a('RV-market', 'Market Research','internal', 4, 'market'),     a('RV-design', 'Design System',  'internal', 4, 'design'), a('RV-avail', 'Available', 'available')],
        mon9:  [a('RV-train',  'Training (L&D)', 'training', 6, 'training'),   a('RV-avail',  'Available',      'available')],
        tue10: [a('RV-market', 'Market Research','internal', 4, 'market'),     a('RV-avail',  'Available',      'available')],
        wed11: [a('RV-train',  'Training (L&D)', 'training', 4, 'training'),   a('RV-avail',  'Available',      'available')],
        thu12: [a('RV-health', 'HealthCo CRM',   'client', 6, 'health'),      a('RV-avail',  'Available',      'available')],
        fri13: [a('RV-acme',   'Acme Portal',    'client', 8, 'acme')],
        sat14: [a('RV-leaves', 'Leaves',         'leaves', 8, 'leaves'),       a('RV-avail',  'Available',      'available')],
      },
    },
    {
      id: 'SP', name: 'Sneha Patel', subtitle: 'Business Analyst', avatar: 'SP', avatarColor: '#22c55e', utilization: 77,
      days: {
        sun8:  [a('SP-int',    'Internal Tools', 'internal', 6, 'internal'),   a('SP-avail',  'Available',      'available')],
        mon9:  [a('SP-train',  'Training (L&D)', 'training', 6, 'training'),   a('SP-avail',  'Available',      'available')],
        tue10: [a('SP-fin',    'FinTech App',    'client', 4, 'fintech'),      a('SP-design', 'Design System',  'internal', 4, 'design')],
        wed11: [a('SP-train',  'Training (L&D)', 'training', 6, 'training'),   a('SP-avail',  'Available',      'available')],
        thu12: [a('SP-market', 'Market Research','internal', 4, 'market'),     a('SP-market2','Market Research','internal', 4, 'market')],
        fri13: [a('SP-fin',    'FinTech App',    'client', 4, 'fintech'),      a('SP-avail',  'Available',      'available')],
        sat14: [a('SP-market', 'Market Research','client', 6, 'market'),       a('SP-avail',  'Available',      'available')],
      },
    },
    {
      id: 'KN', name: 'Karthik Nair', subtitle: 'Backend Engineer', avatar: 'KN', avatarColor: '#06b6d4', utilization: 95,
      days: {
        sun8:  [a('KN-train',  'Training (L&D)', 'training', 6, 'training'),   a('KN-avail',  'Available',      'available')],
        mon9:  [a('KN-leaves', 'Leaves',         'leaves', 8, 'leaves'),       a('KN-avail',  'Available',      'available')],
        tue10: [a('KN-bd',     'BD Proposal',    'client', 4, 'bd'),           a('KN-edu',    'EduPlatform',    'client', 4, 'edu')],
        wed11: [a('KN-leaves', 'Leaves',         'leaves', 8, 'leaves'),       a('KN-avail',  'Available',      'available')],
        thu12: [a('KN-design', 'Design System',  'internal', 8, 'design')],
        fri13: [a('KN-acme',   'Acme Portal',    'client', 8, 'acme')],
        sat14: [a('KN-int',    'Internal Tools', 'internal', 4, 'internal'),   a('KN-design', 'Design System',  'internal', 4, 'design')],
      },
    },
    {
      id: 'DM', name: 'Divya Menon', subtitle: 'Frontend Engineer', avatar: 'DM', avatarColor: '#ec4899', utilization: 51,
      days: {
        sun8:  [a('DM-market', 'Market Research','internal', 4, 'market'),     a('DM-health', 'HealthCo CRM',   'client', 4, 'health'), a('DM-avail', 'Available', 'available')],
        mon9:  [a('DM-train',  'Training (L&D)', 'training', 6, 'training'),   a('DM-avail',  'Available',      'available')],
        tue10: [a('DM-train',  'Training (L&D)', 'training', 6, 'training'),   a('DM-avail',  'Available',      'available')],
        wed11: [a('DM-leaves', 'Leaves',         'leaves', 8, 'leaves'),       a('DM-avail',  'Available',      'available')],
        thu12: [a('DM-int',    'Internal Tools', 'internal', 4, 'internal'),   a('DM-design', 'Design System',  'internal', 4, 'design')],
        fri13: [a('DM-health', 'HealthCo CRM',   'client', 8, 'health')],
        sat14: [a('DM-int',    'Internal Tools', 'internal', 4, 'internal'),   a('DM-acme',   'Acme Portal',    'client', 4, 'acme')],
      },
    },
    {
      id: 'VS', name: 'Vikram Singh', subtitle: 'Data Scientist', avatar: 'VS', avatarColor: '#f97316', utilization: 77,
      days: {
        sun8:  [a('VS-market', 'Market Research','internal', 6, 'market'),     a('VS-avail',  'Available',      'available')],
        mon9:  [a('VS-health', 'HealthCo CRM',   'client', 6, 'health'),      a('VS-avail',  'Available',      'available')],
        tue10: [a('VS-train',  'Training (L&D)', 'training', 6, 'training'),   a('VS-avail',  'Available',      'available')],
        wed11: [a('VS-design', 'Design System',  'internal', 4, 'design'),     a('VS-train',  'Training (L&D)', 'training', 4, 'training')],
        thu12: [a('VS-bd',     'BD Proposal',    'client', 8, 'bd')],
        fri13: [a('VS-acme',   'Acme Portal',    'client', 6, 'acme'),         a('VS-avail',  'Available',      'available')],
        sat14: [a('VS-leaves', 'Leaves',         'leaves', 8, 'leaves'),       a('VS-avail',  'Available',      'available')],
      },
    },
    {
      id: 'AK', name: 'Arun Kumar', subtitle: 'Project Manager', avatar: 'AK', avatarColor: '#14b8a6', utilization: 54,
      days: {
        sun8:  [a('AK-market', 'Market Research','internal', 4, 'market'),     a('AK-train',  'Training (L&D)', 'training', 4, 'training'), a('AK-avail', 'Available', 'available')],
        mon9:  [a('AK-design', 'Design System',  'internal', 6, 'design'),     a('AK-avail',  'Available',      'available')],
        tue10: [a('AK-edu',    'EduPlatform',    'client', 6, 'edu'),          a('AK-avail',  'Available',      'available')],
        wed11: [a('AK-train',  'Training (L&D)', 'training', 4, 'training'),   a('AK-market', 'Market Research','internal', 4, 'market')],
        thu12: [a('AK-int',    'Internal Tools', 'internal', 4, 'internal'),   a('AK-train',  'Training (L&D)', 'training', 4, 'training')],
        fri13: [a('AK-health', 'HealthCo CRM',   'client', 4, 'health'),      a('AK-train',  'Training (L&D)', 'training', 4, 'training')],
        sat14: [a('AK-train',  'Training (L&D)', 'training', 6, 'training'),   a('AK-avail',  'Available',      'available')],
      },
    },
    {
      id: 'SR', name: 'Sanjay Rao', subtitle: 'Project Manager', avatar: 'SR', avatarColor: '#64748b', utilization: 51,
      days: {
        sun8:  [a('SR-train',  'Training (L&D)', 'training', 6, 'training'),   a('SR-avail',  'Available',      'available')],
        mon9:  [a('SR-train',  'Training (L&D)', 'training', 6, 'training'),   a('SR-avail',  'Available',      'available')],
        tue10: [a('SR-design', 'Design System',  'internal', 4, 'design'),     a('SR-avail',  'Available',      'available')],
        wed11: [a('SR-int',    'Internal Tools', 'internal', 6, 'internal'),   a('SR-avail',  'Available',      'available')],
        thu12: [a('SR-train',  'Training (L&D)', 'training', 4, 'training'),   a('SR-market', 'Market Research','internal', 4, 'market')],
        fri13: [a('SR-fin',    'FinTech App',    'client', 6, 'fintech'),      a('SR-avail',  'Available',      'available')],
        sat14: [a('SR-design', 'Design System',  'internal', 4, 'design'),     a('SR-avail',  'Available',      'available')],
      },
    },
    {
      id: 'PS2', name: 'Priya Sharma 2', subtitle: 'Frontend Engineer', avatar: 'PS', avatarColor: '#a855f7', utilization: 89,
      days: {
        sun8:  [a('PS2-leaves','Leaves',         'leaves', 8, 'leaves'),       a('PS2-avail', 'Available',      'available')],
        mon9:  [a('PS2-design','Design System',  'internal', 4, 'design'),     a('PS2-fin',   'FinTech App',    'client', 4, 'fintech')],
        tue10: [a('PS2-train', 'Training (L&D)', 'training', 4, 'training'),   a('PS2-edu',   'EduPlatform',    'client', 4, 'edu')],
        wed11: [a('PS2-int',   'Internal Tools', 'internal', 6, 'internal'),   a('PS2-avail', 'Available',      'available')],
        thu12: [a('PS2-bd',    'BD Proposal',    'client', 8, 'bd')],
        fri13: [a('PS2-train', 'Training (L&D)', 'training', 4, 'training'),   a('PS2-train2','Training (L&D)', 'training', 4, 'training')],
        sat14: [a('PS2-train', 'Training (L&D)', 'training', 6, 'training'),   a('PS2-avail', 'Available',      'available')],
      },
    },
  ]
}

// ── Project View rows (who works on each project per day) ──
export function buildProjectViewRows(): GridRow[] {
  const rMap: Record<string, { id: string; name: string; color: string }> = {}
  resources.forEach(r => { rMap[r.id] = r })

  // Helper: resource label "XX - Name"
  const rLabel = (rId: string) => {
    const r = rMap[rId]
    return r ? `${r.id} - ${r.name.split(' ')[0]}` : rId
  }

  return [
    {
      id: 'acme', name: 'Acme Portal', subtitle: 'Client', avatarColor: '#22c55e',
      days: {
        sun8:  [],
        mon9:  [a('acme-PS', rLabel('PS'), 'client', 6, undefined, 'PS')],
        tue10: [],
        wed11: [a('acme-AM', rLabel('AM'), 'client', 6, undefined, 'AM')],
        thu12: [],
        fri13: [a('acme-RV', rLabel('RV'), 'client', 8, undefined, 'RV'), a('acme-KN', rLabel('KN'), 'client', 8, undefined, 'KN'), a('acme-VS', rLabel('VS'), 'client', 6, undefined, 'VS')],
        sat14: [a('acme-DM', rLabel('DM'), 'client', 4, undefined, 'DM')],
      },
    },
    {
      id: 'bd', name: 'BD Proposal', subtitle: 'Client', avatarColor: '#16a34a',
      days: {
        sun8:  [],
        mon9:  [],
        tue10: [a('bd-KN', rLabel('KN'), 'client', 4, undefined, 'KN')],
        wed11: [],
        thu12: [a('bd-KN2', rLabel('KN'), 'client', 4, undefined, 'KN'), a('bd-VS', rLabel('VS'), 'client', 8, undefined, 'VS'), a('bd-PS2', rLabel('PS2'), 'client', 8, undefined, 'PS2')],
        fri13: [],
        sat14: [],
      },
    },
    {
      id: 'edu', name: 'EduPlatform', subtitle: 'Client', avatarColor: '#15803d',
      days: {
        sun8:  [],
        mon9:  [],
        tue10: [a('edu-KN', rLabel('KN'), 'client', 4, undefined, 'KN'), a('edu-AK', rLabel('AK'), 'client', 6, undefined, 'AK'), a('edu-PS2', rLabel('PS2'), 'client', 4, undefined, 'PS2')],
        wed11: [],
        thu12: [],
        fri13: [],
        sat14: [a('edu-AM', rLabel('AM'), 'client', 4, undefined, 'AM')],
      },
    },
    {
      id: 'fintech', name: 'FinTech App', subtitle: 'Client', avatarColor: '#4ade80',
      days: {
        sun8:  [],
        mon9:  [a('fin-PS', rLabel('PS'), 'client', 4, undefined, 'PS')],
        tue10: [a('fin-AM', rLabel('AM'), 'client', 6, undefined, 'AM'), a('fin-SP', rLabel('SP'), 'client', 4, undefined, 'SP')],
        wed11: [],
        thu12: [],
        fri13: [a('fin-SP2', rLabel('SP'), 'client', 4, undefined, 'SP'), a('fin-SR', rLabel('SR'), 'client', 6, undefined, 'SR')],
        sat14: [],
      },
    },
    {
      id: 'health', name: 'HealthCo CRM', subtitle: 'Client', avatarColor: '#86efac',
      days: {
        sun8:  [a('hc-DM', rLabel('DM'), 'client', 4, undefined, 'DM')],
        mon9:  [a('hc-VS', rLabel('VS'), 'client', 6, undefined, 'VS')],
        tue10: [],
        wed11: [],
        thu12: [a('hc-RV', rLabel('RV'), 'client', 6, undefined, 'RV')],
        fri13: [a('hc-PS', rLabel('PS'), 'client', 4, undefined, 'PS'), a('hc-DM2', rLabel('DM'), 'client', 8, undefined, 'DM'), a('hc-AK', rLabel('AK'), 'client', 4, undefined, 'AK')],
        sat14: [a('hc-AM', rLabel('AM'), 'client', 4, undefined, 'AM')],
      },
    },
    {
      id: 'design', name: 'Design System', subtitle: 'Internal', avatarColor: '#3b82f6',
      days: {
        sun8:  [a('ds-PS', rLabel('PS'), 'internal', 4, undefined, 'PS'), a('ds-RV', rLabel('RV'), 'internal', 4, undefined, 'RV')],
        mon9:  [a('ds-AM', rLabel('AM'), 'internal', 4, undefined, 'AM'), a('ds-AK', rLabel('AK'), 'internal', 6, undefined, 'AK'), a('ds-PS2b', rLabel('PS'), 'internal', 4, undefined, 'PS')],
        tue10: [a('ds-PS2', rLabel('PS'), 'internal', 6, undefined, 'PS'), a('ds-SP', rLabel('SP'), 'internal', 4, undefined, 'SP'), a('ds-SR', rLabel('SR'), 'internal', 4, undefined, 'SR')],
        wed11: [a('ds-VS', rLabel('VS'), 'internal', 4, undefined, 'VS')],
        thu12: [a('ds-KN', rLabel('KN'), 'internal', 8, undefined, 'KN'), a('ds-DM', rLabel('DM'), 'internal', 4, undefined, 'DM')],
        fri13: [a('ds-PS3', rLabel('PS'), 'internal', 4, undefined, 'PS')],
        sat14: [a('ds-KN2', rLabel('KN'), 'internal', 4, undefined, 'KN'), a('ds-SR2', rLabel('SR'), 'internal', 4, undefined, 'SR')],
      },
    },
    {
      id: 'internal', name: 'Internal Tools', subtitle: 'Internal', avatarColor: '#60a5fa',
      days: {
        sun8:  [a('it-SP', rLabel('SP'), 'internal', 6, undefined, 'SP')],
        mon9:  [a('it-AM2', rLabel('AM'), 'internal', 4, undefined, 'AM')],
        tue10: [],
        wed11: [a('it-SR', rLabel('SR'), 'internal', 6, undefined, 'SR'), a('it-PS2', rLabel('PS2'), 'internal', 6, undefined, 'PS2')],
        thu12: [a('it-DM', rLabel('DM'), 'internal', 4, undefined, 'DM'), a('it-AK', rLabel('AK'), 'internal', 4, undefined, 'AK')],
        fri13: [a('it-AM', rLabel('AM'), 'internal', 6, undefined, 'AM')],
        sat14: [a('it-KN', rLabel('KN'), 'internal', 4, undefined, 'KN'), a('it-DM2', rLabel('DM'), 'internal', 4, undefined, 'DM')],
      },
    },
    {
      id: 'market', name: 'Market Research', subtitle: 'Internal', avatarColor: '#2563eb',
      days: {
        sun8:  [a('mr-RV', rLabel('RV'), 'internal', 4, undefined, 'RV'), a('mr-DM', rLabel('DM'), 'internal', 4, undefined, 'DM'), a('mr-VS', rLabel('VS'), 'internal', 6, undefined, 'VS'), a('mr-AK', rLabel('AK'), 'internal', 4, undefined, 'AK')],
        mon9:  [],
        tue10: [a('mr-RV2', rLabel('RV'), 'internal', 4, undefined, 'RV')],
        wed11: [a('mr-AK2', rLabel('AK'), 'internal', 4, undefined, 'AK')],
        thu12: [a('mr-AM', rLabel('AM'), 'internal', 6, undefined, 'AM'), a('mr-SP', rLabel('SP'), 'internal', 4, undefined, 'SP'), a('mr-SR', rLabel('SR'), 'internal', 4, undefined, 'SR')],
        fri13: [],
        sat14: [a('mr-SP2', rLabel('SP'), 'internal', 6, undefined, 'SP')],
      },
    },
    {
      id: 'leaves', name: 'Leaves', subtitle: 'Leaves', avatarColor: '#ef4444',
      days: {
        sun8:  [a('lv-PS2', rLabel('PS2'), 'leaves', 8, undefined, 'PS2')],
        mon9:  [a('lv-KN', rLabel('KN'), 'leaves', 8, undefined, 'KN')],
        tue10: [],
        wed11: [a('lv-PS', rLabel('PS'), 'leaves', 8, undefined, 'PS'), a('lv-KN2', rLabel('KN'), 'leaves', 8, undefined, 'KN'), a('lv-DM', rLabel('DM'), 'leaves', 8, undefined, 'DM')],
        thu12: [],
        fri13: [],
        sat14: [a('lv-RV', rLabel('RV'), 'leaves', 8, undefined, 'RV'), a('lv-VS', rLabel('VS'), 'leaves', 8, undefined, 'VS')],
      },
    },
    {
      id: 'training', name: 'Training (L&D)', subtitle: 'Training', avatarColor: '#8b5cf6',
      days: {
        sun8:  [a('tr-AM', rLabel('AM'), 'training', 4, undefined, 'AM'), a('tr-PS', rLabel('PS'), 'training', 4, undefined, 'PS'), a('tr-KN', rLabel('KN'), 'training', 6, undefined, 'KN'), a('tr-AK', rLabel('AK'), 'training', 4, undefined, 'AK'), a('tr-SR', rLabel('SR'), 'training', 6, undefined, 'SR')],
        mon9:  [a('tr-RV', rLabel('RV'), 'training', 6, undefined, 'RV'), a('tr-SP', rLabel('SP'), 'training', 6, undefined, 'SP'), a('tr-DM', rLabel('DM'), 'training', 6, undefined, 'DM'), a('tr-SR2', rLabel('SR'), 'training', 6, undefined, 'SR')],
        tue10: [a('tr-RV2', rLabel('RV'), 'training', 4, undefined, 'RV'), a('tr-DM2', rLabel('DM'), 'training', 6, undefined, 'DM'), a('tr-VS', rLabel('VS'), 'training', 6, undefined, 'VS'), a('tr-PS2', rLabel('PS2'), 'training', 4, undefined, 'PS2')],
        wed11: [a('tr-RV3', rLabel('RV'), 'training', 4, undefined, 'RV'), a('tr-SP2', rLabel('SP'), 'training', 6, undefined, 'SP'), a('tr-VS2', rLabel('VS'), 'training', 4, undefined, 'VS'), a('tr-AK2', rLabel('AK'), 'training', 4, undefined, 'AK')],
        thu12: [a('tr-PS3', rLabel('PS'), 'training', 8, undefined, 'PS'), a('tr-AK3', rLabel('AK'), 'training', 4, undefined, 'AK'), a('tr-SR3', rLabel('SR'), 'training', 4, undefined, 'SR')],
        fri13: [a('tr-AK4', rLabel('AK'), 'training', 4, undefined, 'AK'), a('tr-PS4', rLabel('PS'), 'training', 4, undefined, 'PS'), a('tr-PS22', rLabel('PS2'), 'training', 4, undefined, 'PS2')],
        sat14: [a('tr-PS5', rLabel('PS'), 'training', 4, undefined, 'PS'), a('tr-AK5', rLabel('AK'), 'training', 6, undefined, 'AK'), a('tr-PS23', rLabel('PS2'), 'training', 6, undefined, 'PS2')],
      },
    },
  ]
}

// ── Stats computed from mock data ─────────────────────────
export const gridStats = {
  totalResources: 100,
  avgUtilization: 70,
  available: 19,
}

// ── Weekday keys used for aggregation ─────────────────────
const WEEKDAY_KEYS = ['mon9', 'tue10', 'wed11', 'thu12', 'fri13']

// ── Bi-weekly columns (grouped weeks) ────────────────────
export const biWeeklyDays = [
  { key: 'week1', label: 'Week 1', sublabel: '09–13 Mar' },
  { key: 'week2', label: 'Week 2', sublabel: '16–20 Mar' },
]

// ── Monthly columns (week summaries) ─────────────────────
export const monthlyColumns = [
  { key: 'w1', label: 'Week 1', sublabel: '02–06 Mar' },
  { key: 'w2', label: 'Week 2', sublabel: '09–13 Mar' },
  { key: 'w3', label: 'Week 3', sublabel: '16–20 Mar' },
  { key: 'w4', label: 'Week 4', sublabel: '23–27 Mar' },
]

// Aggregate a set of day-keys into per-project summary allocations
function summarizeWeek(row: GridRow, dayKeys: string[]): DayAllocation[] {
  const projMap = new Map<string, { hours: number; cat: AllocationCategory; label: string; projectId?: string; resourceId?: string }>()
  for (const k of dayKeys) {
    for (const al of (row.days[k] || [])) {
      if (al.category === 'available') continue
      const existing = projMap.get(al.label)
      if (existing) {
        existing.hours += al.hours || 0
      } else {
        projMap.set(al.label, { hours: al.hours || 0, cat: al.category, label: al.label, projectId: al.projectId, resourceId: al.resourceId })
      }
    }
  }
  return Array.from(projMap.values()).map(v => ({
    id: `${row.id}-${v.label}-${Math.random().toString(36).slice(2, 6)}`,
    label: `${v.label} (${v.hours}h)`,
    category: v.cat,
    hours: v.hours,
    projectId: v.projectId,
    resourceId: v.resourceId,
  }))
}

export function buildBiWeeklyResourceRows(): GridRow[] {
  return buildResourceViewRows().map(row => ({
    ...row,
    days: {
      week1: summarizeWeek(row, WEEKDAY_KEYS),
      week2: summarizeWeek(row, ['tue10', 'wed11', 'thu12', 'fri13', 'mon9']),
    },
  }))
}

export function buildBiWeeklyProjectRows(): GridRow[] {
  return buildProjectViewRows().map(row => ({
    ...row,
    days: {
      week1: summarizeWeek(row, WEEKDAY_KEYS),
      week2: summarizeWeek(row, ['tue10', 'wed11', 'thu12', 'fri13', 'mon9']),
    },
  }))
}

export function buildMonthlyResourceRows(): GridRow[] {
  return buildResourceViewRows().map(row => ({
    ...row,
    days: {
      w1: summarizeWeek(row, ['mon9', 'tue10', 'wed11']),
      w2: summarizeWeek(row, WEEKDAY_KEYS),
      w3: summarizeWeek(row, ['tue10', 'wed11', 'thu12', 'fri13', 'mon9']),
      w4: summarizeWeek(row, ['wed11', 'thu12', 'fri13', 'mon9', 'tue10']),
    },
  }))
}

export function buildMonthlyProjectRows(): GridRow[] {
  return buildProjectViewRows().map(row => ({
    ...row,
    days: {
      w1: summarizeWeek(row, ['mon9', 'tue10', 'wed11']),
      w2: summarizeWeek(row, WEEKDAY_KEYS),
      w3: summarizeWeek(row, ['tue10', 'wed11', 'thu12', 'fri13', 'mon9']),
      w4: summarizeWeek(row, ['wed11', 'thu12', 'fri13', 'mon9', 'tue10']),
    },
  }))
}

// ── Location + role helpers ──────────────────────────────
export const allLocations = ['Mumbai', 'New York', 'London', 'Singapore', 'Sydney']
export const allGrades = ['Partner', 'Director', 'Senior Manager', 'Manager', 'Senior Associate', 'Associate']
export const allRoles = [...new Set(resources.map(r => r.role))]
export const allSubServiceLines = [...new Set(resources.map(r => r.subServiceLine))]
export const allRegions = [...new Set(resources.map(r => r.region))]
export const allSkills = [...new Set(resources.flatMap(r => r.skills))]
