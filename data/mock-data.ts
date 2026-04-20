// Mock data for RMT Phase 1

export interface Resource {
  id: string;
  name: string;
  grade: string;
  serviceLine: string;
  subServiceLine: string;
  location: string;
  skills: string[];
  primarySkill: string;
  sector: string;
  totalFte: number;
  allocations: Allocation[];
}

export interface Allocation {
  projectId: string;
  projectName: string;
  projectCode: string;
  status: "confirmed" | "proposed" | "bench";
  fte: number;
  startDate: string;
  endDate: string;
  weeklyHours: Record<string, number>;
}

export interface Project {
  id: string;
  name: string;
  projectCode: string;
  client: string;
  serviceLine: string;
  subServiceLine: string;
  location: string;
  startDate: string;
  endDate: string;
  totalFte: number;
  status: "active" | "pipeline" | "completed";
  engagementManager: string;
  sector: string;
  roles: ProjectRole[];
}

export interface ProjectRole {
  id: string;
  role: string;
  grade: string;
  requiredFte: number;
  primarySkill: string;
  assignedResource: string | null;
  status: "filled" | "open" | "proposed";
  weeklyLoading: Record<string, number>;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  entity: string;
  entityName: string;
  field: string;
  oldValue: string;
  newValue: string;
}

export const weeks = ["W11 Mar 10", "W12 Mar 17", "W13 Mar 24", "W14 Mar 31", "W15 Apr 7", "W16 Apr 14", "W17 Apr 21", "W18 Apr 28"];
export const months = ["Mar 2026", "Apr 2026", "May 2026", "Jun 2026", "Jul 2026", "Aug 2026"];
export const quarters = ["Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026"];

export const serviceLines = ["ARC", "GRC", "SCC", "Tech Consulting"];
export const subServiceLines: Record<string, string[]> = {
  ARC: ["ARC - A", "ARC - FT", "ARC - T", "ARC - FRM", "ARC - FS"],
  GRC: [],
  SCC: [],
  "Tech Consulting": [],
};

/** Primary skills relevant per service line — used for quick-select tabs in the request form */
export const skillsByServiceLine: Record<string, string[]> = {
  ARC: [
    "Auditing/ Accounting Support",
    "Technical Accounting- US GAAP",
    "Financial Risk Management",
    "IPO",
    "Finance transformation",
    "ERM/ Policies & Procedures/ others",
    "SOX/ ICOFR",
    "Technical Accounting- IFRS/ IND AS",
  ],
  GRC: [
    "Auditing/ Accounting Support",
    "Technical Accounting- US GAAP",
    "Financial Risk Management",
    "IPO",
    "Finance transformation",
    "ERM/ Policies & Procedures/ others",
    "SOX/ ICOFR",
    "Technical Accounting- IFRS/ IND AS",
  ],
  HRC: [
    "Tax Compliance", "Transfer Pricing", "International Tax",
    "HR Consulting", "Compensation & Benefits", "Talent Management",
  ],
  SCC: [
    "Strategy", "Operations", "Business Analysis", "Project Management",
    "Digital Transformation", "Agile", "Supply Chain", "Procurement",
  ],
  "Tech Consulting": [
    "Cloud Architecture", "Data Analytics", "Cyber Security",
    "React", "Node.js", "DevOps", "AI/ML", "Enterprise Architecture",
  ],
};
export const locations = ["New York", "London", "Singapore", "Mumbai", "Sydney"];
export const grades = ["Partner", "Director", "Senior Manager", "Manager", "Senior Associate", "Associate"];
export const primarySkills = [
  "Financial Modeling", "M&A", "Due Diligence", "Forensic Accounting", "Data Analytics",
  "Project Management", "Agile", "Business Analysis", "Tax Compliance", "Transfer Pricing",
  "International Tax", "IFRS", "SOX Compliance", "Risk Assessment", "Cloud Architecture",
  "React", "Node.js", "Strategy", "Operations", "Digital Transformation", "Cyber Security",
  "Restructuring", "Valuation", "eDiscovery", "Litigation Support",
];
export const sectors = [
  "Financial Services", "Technology & Media", "Healthcare & Life Sciences",
  "Consumer & Retail", "Energy & Natural Resources", "Government & Public Sector",
  "Industrial Manufacturing",
];

// Dummy project codes for unassigned/placeholder projects (location × service line)
export const dummyProjectCodes: Record<string, Record<string, string>> = {
  "New York": { ARC: "DUM-NY-ARC", HRC: "DUM-NY-HRC", SCC: "DUM-NY-SCC", "Tech Consulting": "DUM-NY-TEC" },
  London: { ARC: "DUM-LN-ARC", HRC: "DUM-LN-HRC", SCC: "DUM-LN-SCC", "Tech Consulting": "DUM-LN-TEC" },
  Singapore: { ARC: "DUM-SG-ARC", HRC: "DUM-SG-HRC", SCC: "DUM-SG-SCC", "Tech Consulting": "DUM-SG-TEC" },
  Mumbai: { ARC: "DUM-MB-ARC", HRC: "DUM-MB-HRC", SCC: "DUM-MB-SCC", "Tech Consulting": "DUM-MB-TEC" },
  Sydney: { ARC: "DUM-SY-ARC", HRC: "DUM-SY-HRC", SCC: "DUM-SY-SCC", "Tech Consulting": "DUM-SY-TEC" },
};

export const mockResources: Resource[] = [
  {
    id: "R001",
    name: "Sarah Chen",
    grade: "Senior Manager",
    serviceLine: "ARC",
    subServiceLine: "ARC - FT",
    location: "New York",
    skills: ["Financial Modeling", "M&A", "Due Diligence"],
    primarySkill: "Financial Modeling",
    sector: "Financial Services",
    totalFte: 1.3,
    allocations: [
      { projectId: "P001", projectName: "Project Alpha", projectCode: "ARC-2026-001", status: "confirmed", fte: 0.8, startDate: "2026-03-01", endDate: "2026-06-30", weeklyHours: { "W11 Mar 10": 32, "W12 Mar 17": 32, "W13 Mar 24": 32, "W14 Mar 31": 32, "W15 Apr 7": 32, "W16 Apr 14": 32, "W17 Apr 21": 32, "W18 Apr 28": 32 } },
      { projectId: "P003", projectName: "Project Gamma", projectCode: "ADV-2026-003", status: "confirmed", fte: 0.5, startDate: "2026-03-10", endDate: "2026-05-15", weeklyHours: { "W11 Mar 10": 20, "W12 Mar 17": 20, "W13 Mar 24": 20, "W14 Mar 31": 20, "W15 Apr 7": 20, "W16 Apr 14": 20, "W17 Apr 21": 0, "W18 Apr 28": 0 } },
    ],
  },
  {
    id: "R002",
    name: "John Smith",
    grade: "Manager",
    serviceLine: "SCC",
    subServiceLine: "",
    location: "London",
    skills: ["Project Management", "Agile", "Business Analysis"],
    primarySkill: "Project Management",
    sector: "Technology & Media",
    totalFte: 1.0,
    allocations: [
      { projectId: "P002", projectName: "Project Beta", projectCode: "CON-2026-002", status: "confirmed", fte: 1.0, startDate: "2026-02-15", endDate: "2026-07-31", weeklyHours: { "W11 Mar 10": 40, "W12 Mar 17": 40, "W13 Mar 24": 40, "W14 Mar 31": 40, "W15 Apr 7": 40, "W16 Apr 14": 40, "W17 Apr 21": 40, "W18 Apr 28": 40 } },
    ],
  },
  {
    id: "R003",
    name: "Priya Patel",
    grade: "Senior Associate",
    serviceLine: "HRC",
    subServiceLine: "",
    location: "Mumbai",
    skills: ["Tax Compliance", "Transfer Pricing", "International Tax"],
    primarySkill: "Transfer Pricing",
    sector: "Consumer & Retail",
    totalFte: 0.5,
    allocations: [
      { projectId: "P004", projectName: "Project Delta", projectCode: "TAX-2026-004", status: "proposed", fte: 0.5, startDate: "2026-04-01", endDate: "2026-06-30", weeklyHours: { "W11 Mar 10": 0, "W12 Mar 17": 0, "W13 Mar 24": 0, "W14 Mar 31": 0, "W15 Apr 7": 20, "W16 Apr 14": 20, "W17 Apr 21": 20, "W18 Apr 28": 20 } },
    ],
  },
  {
    id: "R004",
    name: "David Lee",
    grade: "Associate",
    serviceLine: "Tech Consulting",
    subServiceLine: "",
    location: "Singapore",
    skills: ["React", "Node.js", "Cloud Architecture"],
    primarySkill: "Cloud Architecture",
    sector: "Technology & Media",
    totalFte: 0,
    allocations: [],
  },
  {
    id: "R005",
    name: "Emily Brown",
    grade: "Director",
    serviceLine: "ARC",
    subServiceLine: "ARC - FS",
    location: "Sydney",
    skills: ["IFRS", "SOX Compliance", "Risk Assessment"],
    primarySkill: "Risk Assessment",
    sector: "Financial Services",
    totalFte: 0.8,
    allocations: [
      { projectId: "P001", projectName: "Project Alpha", projectCode: "ARC-2026-001", status: "confirmed", fte: 0.3, startDate: "2026-03-01", endDate: "2026-04-30", weeklyHours: { "W11 Mar 10": 12, "W12 Mar 17": 12, "W13 Mar 24": 12, "W14 Mar 31": 12, "W15 Apr 7": 12, "W16 Apr 14": 0, "W17 Apr 21": 0, "W18 Apr 28": 0 } },
      { projectId: "P005", projectName: "Project Epsilon", projectCode: "ARC-2026-005", status: "confirmed", fte: 0.5, startDate: "2026-03-15", endDate: "2026-08-31", weeklyHours: { "W11 Mar 10": 0, "W12 Mar 17": 20, "W13 Mar 24": 20, "W14 Mar 31": 20, "W15 Apr 7": 20, "W16 Apr 14": 20, "W17 Apr 21": 20, "W18 Apr 28": 20 } },
    ],
  },
  {
    id: "R006",
    name: "Michael Torres",
    grade: "Senior Manager",
    serviceLine: "SCC",
    subServiceLine: "",
    location: "New York",
    skills: ["Strategy", "Operations", "Digital Transformation"],
    primarySkill: "Strategy",
    sector: "Industrial Manufacturing",
    totalFte: 1.2,
    allocations: [
      { projectId: "P002", projectName: "Project Beta", projectCode: "CON-2026-002", status: "confirmed", fte: 0.7, startDate: "2026-03-01", endDate: "2026-06-30", weeklyHours: { "W11 Mar 10": 28, "W12 Mar 17": 28, "W13 Mar 24": 28, "W14 Mar 31": 28, "W15 Apr 7": 28, "W16 Apr 14": 28, "W17 Apr 21": 28, "W18 Apr 28": 28 } },
      { projectId: "P005", projectName: "Project Epsilon", projectCode: "ARC-2026-005", status: "proposed", fte: 0.5, startDate: "2026-04-01", endDate: "2026-07-31", weeklyHours: { "W11 Mar 10": 0, "W12 Mar 17": 0, "W13 Mar 24": 0, "W14 Mar 31": 0, "W15 Apr 7": 20, "W16 Apr 14": 20, "W17 Apr 21": 20, "W18 Apr 28": 20 } },
    ],
  },
];

export const mockProjects: Project[] = [
  {
    id: "P001",
    name: "Project Alpha",
    projectCode: "ARC-2026-001",
    client: "Acme Corp",
    serviceLine: "ARC",
    subServiceLine: "ARC - FT",
    location: "New York",
    startDate: "2026-03-01",
    endDate: "2026-06-30",
    totalFte: 2.5,
    status: "active",
    engagementManager: "Lisa Wang",
    sector: "Financial Services",
    roles: [
      { id: "PR001", role: "Lead Advisor", grade: "Senior Manager", requiredFte: 0.8, primarySkill: "Financial Modeling", assignedResource: "Sarah Chen", status: "filled", weeklyLoading: { "W11 Mar 10": 32, "W12 Mar 17": 32, "W13 Mar 24": 32, "W14 Mar 31": 32, "W15 Apr 7": 32, "W16 Apr 14": 32, "W17 Apr 21": 32, "W18 Apr 28": 32 } },
      { id: "PR002", role: "Quality Reviewer", grade: "Director", requiredFte: 0.3, primarySkill: "Risk Assessment", assignedResource: "Emily Brown", status: "filled", weeklyLoading: { "W11 Mar 10": 12, "W12 Mar 17": 12, "W13 Mar 24": 12, "W14 Mar 31": 12, "W15 Apr 7": 12, "W16 Apr 14": 0, "W17 Apr 21": 0, "W18 Apr 28": 0 } },
      { id: "PR003", role: "Analyst", grade: "Associate", requiredFte: 1.0, primarySkill: "Data Analytics", assignedResource: null, status: "open", weeklyLoading: { "W11 Mar 10": 40, "W12 Mar 17": 40, "W13 Mar 24": 40, "W14 Mar 31": 40, "W15 Apr 7": 40, "W16 Apr 14": 40, "W17 Apr 21": 40, "W18 Apr 28": 40 } },
    ],
  },
  {
    id: "P002",
    name: "Project Beta",
    projectCode: "CON-2026-002",
    client: "Global Industries",
    serviceLine: "SCC",
    subServiceLine: "",
    location: "London",
    startDate: "2026-02-15",
    endDate: "2026-07-31",
    totalFte: 3.0,
    status: "active",
    engagementManager: "Mark Johnson",
    sector: "Technology & Media",
    roles: [
      { id: "PR004", role: "Project Manager", grade: "Manager", requiredFte: 1.0, primarySkill: "Project Management", assignedResource: "John Smith", status: "filled", weeklyLoading: { "W11 Mar 10": 40, "W12 Mar 17": 40, "W13 Mar 24": 40, "W14 Mar 31": 40, "W15 Apr 7": 40, "W16 Apr 14": 40, "W17 Apr 21": 40, "W18 Apr 28": 40 } },
      { id: "PR005", role: "Strategy Lead", grade: "Senior Manager", requiredFte: 0.7, primarySkill: "Strategy", assignedResource: "Michael Torres", status: "filled", weeklyLoading: { "W11 Mar 10": 28, "W12 Mar 17": 28, "W13 Mar 24": 28, "W14 Mar 31": 28, "W15 Apr 7": 28, "W16 Apr 14": 28, "W17 Apr 21": 28, "W18 Apr 28": 28 } },
      { id: "PR006", role: "Business Analyst", grade: "Senior Associate", requiredFte: 1.0, primarySkill: "Business Analysis", assignedResource: null, status: "open", weeklyLoading: { "W11 Mar 10": 40, "W12 Mar 17": 40, "W13 Mar 24": 40, "W14 Mar 31": 40, "W15 Apr 7": 40, "W16 Apr 14": 40, "W17 Apr 21": 40, "W18 Apr 28": 40 } },
    ],
  },
  {
    id: "P003",
    name: "Project Gamma",
    projectCode: "ADV-2026-003",
    client: "Tech Solutions Ltd",
    serviceLine: "HRC",
    subServiceLine: "",
    location: "New York",
    startDate: "2026-03-10",
    endDate: "2026-05-15",
    totalFte: 1.5,
    status: "active",
    engagementManager: "Lisa Wang",
    sector: "Technology & Media",
    roles: [
      { id: "PR007", role: "Advisor", grade: "Senior Manager", requiredFte: 0.5, primarySkill: "M&A", assignedResource: "Sarah Chen", status: "filled", weeklyLoading: { "W11 Mar 10": 20, "W12 Mar 17": 20, "W13 Mar 24": 20, "W14 Mar 31": 20, "W15 Apr 7": 20, "W16 Apr 14": 20, "W17 Apr 21": 0, "W18 Apr 28": 0 } },
      { id: "PR008", role: "Junior Analyst", grade: "Associate", requiredFte: 1.0, primarySkill: "Due Diligence", assignedResource: null, status: "open", weeklyLoading: { "W11 Mar 10": 40, "W12 Mar 17": 40, "W13 Mar 24": 40, "W14 Mar 31": 40, "W15 Apr 7": 40, "W16 Apr 14": 40, "W17 Apr 21": 0, "W18 Apr 28": 0 } },
    ],
  },
  {
    id: "P004",
    name: "Project Delta",
    projectCode: "TAX-2026-004",
    client: "Pacific Holdings",
    serviceLine: "HRC",
    subServiceLine: "",
    location: "Mumbai",
    startDate: "2026-04-01",
    endDate: "2026-06-30",
    totalFte: 2.0,
    status: "pipeline",
    engagementManager: "Raj Kumar",
    sector: "Consumer & Retail",
    roles: [
      { id: "PR009", role: "Tax Specialist", grade: "Senior Associate", requiredFte: 0.5, primarySkill: "Transfer Pricing", assignedResource: "Priya Patel", status: "proposed", weeklyLoading: { "W11 Mar 10": 0, "W12 Mar 17": 0, "W13 Mar 24": 0, "W14 Mar 31": 0, "W15 Apr 7": 20, "W16 Apr 14": 20, "W17 Apr 21": 20, "W18 Apr 28": 20 } },
      { id: "PR010", role: "Tax Manager", grade: "Manager", requiredFte: 1.0, primarySkill: "Tax Compliance", assignedResource: null, status: "open", weeklyLoading: {} },
    ],
  },
  {
    id: "P005",
    name: "Project Epsilon",
    projectCode: "ARC-2026-005",
    client: "Stellar Finance",
    serviceLine: "ARC",
    subServiceLine: "ARC - FS",
    location: "Sydney",
    startDate: "2026-03-15",
    endDate: "2026-08-31",
    totalFte: 2.0,
    status: "active",
    engagementManager: "Anna Scott",
    sector: "Financial Services",
    roles: [
      { id: "PR011", role: "Audit Lead", grade: "Director", requiredFte: 0.5, primarySkill: "SOX Compliance", assignedResource: "Emily Brown", status: "filled", weeklyLoading: { "W11 Mar 10": 0, "W12 Mar 17": 20, "W13 Mar 24": 20, "W14 Mar 31": 20, "W15 Apr 7": 20, "W16 Apr 14": 20, "W17 Apr 21": 20, "W18 Apr 28": 20 } },
      { id: "PR012", role: "Senior Consultant", grade: "Senior Manager", requiredFte: 0.5, primarySkill: "Digital Transformation", assignedResource: "Michael Torres", status: "proposed", weeklyLoading: { "W11 Mar 10": 0, "W12 Mar 17": 0, "W13 Mar 24": 0, "W14 Mar 31": 0, "W15 Apr 7": 20, "W16 Apr 14": 20, "W17 Apr 21": 20, "W18 Apr 28": 20 } },
    ],
  },
];

export const mockAuditLog: AuditEntry[] = [
  { id: "A001", timestamp: "2026-03-13 14:32:00", user: "Lisa Wang", action: "Updated", entity: "Project", entityName: "Project Alpha", field: "End Date", oldValue: "2026-05-31", newValue: "2026-06-30" },
  { id: "A002", timestamp: "2026-03-13 11:15:00", user: "Mark Johnson", action: "Created", entity: "Booking", entityName: "John Smith → Project Beta", field: "FTE", oldValue: "—", newValue: "100%" },
  { id: "A003", timestamp: "2026-03-12 16:45:00", user: "David Lee", action: "Updated", entity: "Resource", entityName: "Priya Patel", field: "Status", oldValue: "Confirmed", newValue: "Proposed" },
  { id: "A004", timestamp: "2026-03-12 09:20:00", user: "System", action: "Alert", entity: "Resource", entityName: "Sarah Chen", field: "Allocation", oldValue: "100%", newValue: "130% (Over-allocated)" },
  { id: "A005", timestamp: "2026-03-11 13:00:00", user: "Anna Scott", action: "Created", entity: "Project", entityName: "Project Epsilon", field: "—", oldValue: "—", newValue: "New project created" },
  { id: "A006", timestamp: "2026-03-10 10:30:00", user: "Raj Kumar", action: "Updated", entity: "Booking", entityName: "Michael Torres → Project Beta", field: "Hours", oldValue: "24 hrs/wk", newValue: "28 hrs/wk" },
];

export const kpiData = {
  totalCapacity: 48,
  forecastedFte: 42.5,
  utilization: 88.5,
  avgCompliance: 94.0,
  benchCount: 1,
  timesheetGapCount: 1,
  overAllocated: 2,
  variance: -5.5,
};

export const capacityByServiceLine = [
  { serviceLine: "ARC", subServiceLines: ["ARC - A", "ARC - FT", "ARC - T", "ARC - FRM", "ARC - FS"], capacity: 12, forecast: 10.5, actual: 9.8 },
  { serviceLine: "HRC", subServiceLines: [], capacity: 6, forecast: 5.2, actual: 4.8 },
  { serviceLine: "SCC", subServiceLines: [], capacity: 10, forecast: 11.2, actual: 10.5 },
  { serviceLine: "Tech Consulting", subServiceLines: [], capacity: 8, forecast: 6.0, actual: 5.2 },
];

export const capacityByLocation = [
  { location: "New York", capacity: 14, forecast: 12.5, actual: 11.8 },
  { location: "London", capacity: 10, forecast: 9.0, actual: 8.5 },
  { location: "Singapore", capacity: 8, forecast: 6.0, actual: 5.2 },
  { location: "Mumbai", capacity: 8, forecast: 7.5, actual: 7.0 },
  { location: "Sydney", capacity: 8, forecast: 7.5, actual: 6.8 },
];

export const utilizationByMonth = [
  { month: "Jan", forecast: 82, actual: 80 },
  { month: "Feb", forecast: 85, actual: 83 },
  { month: "Mar", forecast: 88, actual: 86 },
  { month: "Apr", forecast: 90, actual: null },
  { month: "May", forecast: 87, actual: null },
  { month: "Jun", forecast: 85, actual: null },
];

// Chargeability by role (bar chart data matching GRC Chargeability ME reference)
export const chargeabilityByRole = [
  { role: "Analyst", jan: 4, feb: 30 },
  { role: "Associate Consultant", jan: 89, feb: 84 },
  { role: "Consultant", jan: 87, feb: 95 },
  { role: "Assistant Manager", jan: 66, feb: 73 },
  { role: "Manager", jan: 44, feb: 65 },
  { role: "Associate Director", jan: 78, feb: 29 },
];

// Forecast weekly periods grouped by month
export const forecastMonths = [
  {
    month: "Jan '26",
    weeks: ["01-02", "05-09", "12-16", "19-23", "26-30"],
  },
  {
    month: "Feb '26",
    weeks: ["02-06", "09-13", "16-20", "23-27"],
  },
];

export interface ForecastEntry {
  id: string;
  name: string;
  shortCode: string;
  color: string;
  weeklyUtilization: Record<string, number | null>;
  children?: ForecastEntry[];
}

// Role-wise forecast data with employee and project drill-down
export const forecastByRole: ForecastEntry[] = [
  {
    id: "role-analyst",
    name: "Analyst",
    shortCode: "A",
    color: "hsl(220, 70%, 55%)",
    weeklyUtilization: {
      "Jan '26|01-02": 38.07, "Jan '26|05-09": null, "Jan '26|12-16": 55.67, "Jan '26|19-23": null, "Jan '26|26-30": 54.35,
      "Feb '26|02-06": 43.01, "Feb '26|09-13": 43.48, "Feb '26|16-20": 44.94, "Feb '26|23-27": 43.48,
    },
    children: [
      {
        id: "emp-david-lee",
        name: "David Lee",
        shortCode: "DL",
        color: "hsl(220, 70%, 55%)",
        weeklyUtilization: {
          "Jan '26|01-02": 42.5, "Jan '26|05-09": null, "Jan '26|12-16": 60.0, "Jan '26|19-23": null, "Jan '26|26-30": 55.0,
          "Feb '26|02-06": 45.0, "Feb '26|09-13": 44.0, "Feb '26|16-20": 46.0, "Feb '26|23-27": 44.0,
        },
        children: [
          {
            id: "proj-alpha-dl",
            name: "Project Alpha",
            shortCode: "PA",
            color: "hsl(142, 50%, 45%)",
            weeklyUtilization: {
              "Jan '26|01-02": 25.0, "Jan '26|05-09": null, "Jan '26|12-16": 35.0, "Jan '26|19-23": null, "Jan '26|26-30": 30.0,
              "Feb '26|02-06": 25.0, "Feb '26|09-13": 24.0, "Feb '26|16-20": 26.0, "Feb '26|23-27": 24.0,
            },
          },
          {
            id: "proj-gamma-dl",
            name: "Project Gamma",
            shortCode: "PG",
            color: "hsl(35, 80%, 55%)",
            weeklyUtilization: {
              "Jan '26|01-02": 17.5, "Jan '26|05-09": null, "Jan '26|12-16": 25.0, "Jan '26|19-23": null, "Jan '26|26-30": 25.0,
              "Feb '26|02-06": 20.0, "Feb '26|09-13": 20.0, "Feb '26|16-20": 20.0, "Feb '26|23-27": 20.0,
            },
          },
        ],
      },
    ],
  },
  {
    id: "role-assistant-manager",
    name: "Assistant Manager",
    shortCode: "AM",
    color: "hsl(220, 70%, 55%)",
    weeklyUtilization: {
      "Jan '26|01-02": 49.06, "Jan '26|05-09": null, "Jan '26|12-16": 53.89, "Jan '26|19-23": null, "Jan '26|26-30": 53.77,
      "Feb '26|02-06": 54.61, "Feb '26|09-13": 54.09, "Feb '26|16-20": 51.7, "Feb '26|23-27": 50.08,
    },
    children: [
      {
        id: "emp-john-smith",
        name: "John Smith",
        shortCode: "JS",
        color: "hsl(220, 70%, 55%)",
        weeklyUtilization: {
          "Jan '26|01-02": 49.06, "Jan '26|05-09": null, "Jan '26|12-16": 53.89, "Jan '26|19-23": null, "Jan '26|26-30": 53.77,
          "Feb '26|02-06": 54.61, "Feb '26|09-13": 54.09, "Feb '26|16-20": 51.7, "Feb '26|23-27": 50.08,
        },
        children: [
          {
            id: "proj-beta-js",
            name: "Project Beta",
            shortCode: "PB",
            color: "hsl(142, 50%, 45%)",
            weeklyUtilization: {
              "Jan '26|01-02": 49.06, "Jan '26|05-09": null, "Jan '26|12-16": 53.89, "Jan '26|19-23": null, "Jan '26|26-30": 53.77,
              "Feb '26|02-06": 54.61, "Feb '26|09-13": 54.09, "Feb '26|16-20": 51.7, "Feb '26|23-27": 50.08,
            },
          },
        ],
      },
    ],
  },
  {
    id: "role-associate-consultant",
    name: "Associate Consultant",
    shortCode: "AC",
    color: "hsl(10, 70%, 60%)",
    weeklyUtilization: {
      "Jan '26|01-02": 14.7, "Jan '26|05-09": 15.18, "Jan '26|12-16": 19.05, "Jan '26|19-23": 18.8, "Jan '26|26-30": 18.72,
      "Feb '26|02-06": 19.46, "Feb '26|09-13": 19.64, "Feb '26|16-20": 20.09, "Feb '26|23-27": 18.06,
    },
    children: [
      {
        id: "emp-priya-patel",
        name: "Priya Patel",
        shortCode: "PP",
        color: "hsl(10, 70%, 60%)",
        weeklyUtilization: {
          "Jan '26|01-02": 14.7, "Jan '26|05-09": 15.18, "Jan '26|12-16": 19.05, "Jan '26|19-23": 18.8, "Jan '26|26-30": 18.72,
          "Feb '26|02-06": 19.46, "Feb '26|09-13": 19.64, "Feb '26|16-20": 20.09, "Feb '26|23-27": 18.06,
        },
        children: [
          {
            id: "proj-delta-pp",
            name: "Project Delta",
            shortCode: "PD",
            color: "hsl(35, 80%, 55%)",
            weeklyUtilization: {
              "Jan '26|01-02": 14.7, "Jan '26|05-09": 15.18, "Jan '26|12-16": 19.05, "Jan '26|19-23": 18.8, "Jan '26|26-30": 18.72,
              "Feb '26|02-06": 19.46, "Feb '26|09-13": 19.64, "Feb '26|16-20": 20.09, "Feb '26|23-27": 18.06,
            },
          },
        ],
      },
    ],
  },
  {
    id: "role-associate-director",
    name: "Associate Director",
    shortCode: "AD",
    color: "hsl(10, 70%, 60%)",
    weeklyUtilization: {
      "Jan '26|01-02": 12.5, "Jan '26|05-09": 24.9, "Jan '26|12-16": 41.39, "Jan '26|19-23": 42.95, "Jan '26|26-30": 42.22,
      "Feb '26|02-06": 39.42, "Feb '26|09-13": 38.39, "Feb '26|16-20": 38.39, "Feb '26|23-27": 38.53,
    },
    children: [
      {
        id: "emp-emily-brown",
        name: "Emily Brown",
        shortCode: "EB",
        color: "hsl(10, 70%, 60%)",
        weeklyUtilization: {
          "Jan '26|01-02": 12.5, "Jan '26|05-09": 24.9, "Jan '26|12-16": 41.39, "Jan '26|19-23": 42.95, "Jan '26|26-30": 42.22,
          "Feb '26|02-06": 39.42, "Feb '26|09-13": 38.39, "Feb '26|16-20": 38.39, "Feb '26|23-27": 38.53,
        },
        children: [
          {
            id: "proj-alpha-eb",
            name: "Project Alpha",
            shortCode: "PA",
            color: "hsl(142, 50%, 45%)",
            weeklyUtilization: {
              "Jan '26|01-02": 7.5, "Jan '26|05-09": 12.0, "Jan '26|12-16": 12.0, "Jan '26|19-23": 12.0, "Jan '26|26-30": 12.0,
              "Feb '26|02-06": 0, "Feb '26|09-13": 0, "Feb '26|16-20": 0, "Feb '26|23-27": 0,
            },
          },
          {
            id: "proj-epsilon-eb",
            name: "Project Epsilon",
            shortCode: "PE",
            color: "hsl(270, 50%, 55%)",
            weeklyUtilization: {
              "Jan '26|01-02": 5.0, "Jan '26|05-09": 12.9, "Jan '26|12-16": 29.39, "Jan '26|19-23": 30.95, "Jan '26|26-30": 30.22,
              "Feb '26|02-06": 39.42, "Feb '26|09-13": 38.39, "Feb '26|16-20": 38.39, "Feb '26|23-27": 38.53,
            },
          },
        ],
      },
    ],
  },
];
