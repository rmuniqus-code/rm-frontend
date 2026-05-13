export type ApprovalStatus = "todo" | "shortlisted" | "em_approved" | "approved" | "blocked";
export type RequestType = "New team member" | "Extension" | "Reallocation" | "Release";
export type BookingType = "Confirmed" | "Unconfirmed";

export interface ShortlistedResource {
  id: string;
  request_id: string;
  employee_id: string | null;
  employee_name: string;
  grade: string | null;
  service_line: string | null;
  sub_service_line: string | null;
  location: string | null;
  utilization_pct: number | null;
  fit_score: number | null;
  shortlisted_by: string | null;
  notes: string | null;
  status: 'shortlisted' | 'em_selected' | 'rejected';
  created_at: string;
}

export interface ResourceRequest {
  id: number;
  resourceRequested: string;
  resourceAvatar?: string;
  durationStart: string;
  durationEnd: string;
  hoursPerDay: string;
  approvalStatus: ApprovalStatus;
  requestType: RequestType;
  bookingType: BookingType;
  projectName: string;
  projectColor: string;
  hours: string;
  requestedBy: string;
  requestedDate: string;
  role?: string;
  grade?: string;
  primarySkill?: string;
  sector?: string;
  // Extended fields carried through from API for edit mode
  opportunityId?: string;
  emEpName?: string;
  skillSet?: string;
  travelRequirements?: string;
  projectStatus?: string;
  loadingPct?: number;
  notes?: string;
  /** Raw ISO dates for edit form (durationStart/End are display-formatted) */
  startDateISO?: string;
  endDateISO?: string;
  /** DB UUID — used for PATCH/DELETE API calls */
  uuid?: string;
  /** Service line required for this resource request */
  serviceLine?: string;
  /** Sub-service line required for this resource request */
  subServiceLine?: string;
  /** UUID of the employee the EM/EP selected during first approval */
  emApprovedResourceId?: string;
  /** Note left by the EM/EP when giving first approval */
  emApprovalNotes?: string;
}

export const mockRequests: ResourceRequest[] = [
  {
    id: 60880,
    resourceRequested: "Aakrati Jain",
    durationStart: "18 Nov 25",
    durationEnd: "04 Dec 25",
    hoursPerDay: "7h 59m",
    approvalStatus: "todo",
    requestType: "New team member",
    bookingType: "Confirmed",
    projectName: "Yatra Online INC",
    projectColor: "#eab308",
    hours: "8h 00m",
    requestedBy: "Lisa Wang",
    requestedDate: "10 Nov 2025, 9:15 AM",
    role: "Consultant",
    grade: "Manager",
    primarySkill: "Financial Modeling",
    sector: "Banking & Finance",
  },
  {
    id: 60879,
    resourceRequested: "Assistant Manager",
    durationStart: "26 Nov 25",
    durationEnd: "04 Dec 25",
    hoursPerDay: "7h 59m",
    approvalStatus: "todo",
    requestType: "New team member",
    bookingType: "Unconfirmed",
    projectName: "Yatra Online INC",
    projectColor: "#eab308",
    hours: "8h 00m",
    requestedBy: "Mark Johnson",
    requestedDate: "15 Nov 2025, 2:30 PM",
    role: "Assistant Manager",
    grade: "Associate",
    primarySkill: "Audit",
    sector: "Technology",
  },
  {
    id: 28867,
    resourceRequested: "Consultant",
    durationStart: "17 Feb 25",
    durationEnd: "31 Mar 25",
    hoursPerDay: "7h 59m",
    approvalStatus: "approved",
    requestType: "New team member",
    bookingType: "Confirmed",
    projectName: "BRSR - FY 2024-25",
    projectColor: "#22c55e",
    hours: "8h 00m",
    requestedBy: "Raj Kumar",
    requestedDate: "10 Feb 2025, 11:42 AM",
    role: "Consultant",
    grade: "Senior Manager",
    primarySkill: "Data Analytics",
    sector: "Healthcare",
  },
  {
    id: 26787,
    resourceRequested: "Consultant",
    durationStart: "08 Apr 25",
    durationEnd: "25 Apr 25",
    hoursPerDay: "8h",
    approvalStatus: "blocked",
    requestType: "New team member",
    bookingType: "Unconfirmed",
    projectName: "US GAAP FY25",
    projectColor: "#f97316",
    hours: "112h 00m",
    requestedBy: "Anna Scott",
    requestedDate: "28 Mar 2025, 4:05 PM",
    role: "Consultant",
    grade: "Manager",
    primarySkill: "SAP",
    sector: "Manufacturing",
  },
  {
    id: 25964,
    resourceRequested: "Consultant",
    durationStart: "17 Feb 25",
    durationEnd: "30 May 25",
    hoursPerDay: "1h",
    approvalStatus: "todo",
    requestType: "New team member",
    bookingType: "Confirmed",
    projectName: "BRSR - FY 2024-25",
    projectColor: "#22c55e",
    hours: "75h 00m",
    requestedBy: "Raj Kumar",
    requestedDate: "5 Feb 2025, 8:30 AM",
    role: "Consultant",
    grade: "Associate",
    primarySkill: "Cloud Architecture",
    sector: "Energy",
  },
  {
    id: 22815,
    resourceRequested: "Consultant",
    durationStart: "03 Feb 25",
    durationEnd: "28 Feb 25",
    hoursPerDay: "1h 36m",
    approvalStatus: "todo",
    requestType: "New team member",
    bookingType: "Unconfirmed",
    projectName: "testingggg - Astro Stimul",
    projectColor: "#3b82f6",
    hours: "32h 00m",
    requestedBy: "David Lee",
    requestedDate: "25 Jan 2025, 10:12 AM",
    role: "Consultant",
    grade: "Manager",
    primarySkill: "React",
    sector: "Technology",
  },
  {
    id: 21068,
    resourceRequested: "Consultant",
    durationStart: "03 Feb 25",
    durationEnd: "31 Mar 25",
    hoursPerDay: "48m",
    approvalStatus: "todo",
    requestType: "New team member",
    bookingType: "Confirmed",
    projectName: "testingggg - Astro Stimul",
    projectColor: "#3b82f6",
    hours: "32h 47m",
    requestedBy: "Emily Brown",
    requestedDate: "20 Jan 2025, 3:45 PM",
    role: "Consultant",
    grade: "Senior Manager",
    primarySkill: "Python",
    sector: "Retail",
  },
  {
    id: 20861,
    resourceRequested: "Aksha Shetty",
    durationStart: "03 Feb 25",
    durationEnd: "31 Mar 25",
    hoursPerDay: "48m",
    approvalStatus: "todo",
    requestType: "New team member",
    bookingType: "Unconfirmed",
    projectName: "testingggg - Astro Stimul",
    projectColor: "#3b82f6",
    hours: "32h 47m",
    requestedBy: "Michael Torres",
    requestedDate: "18 Jan 2025, 1:20 PM",
    role: "Senior Developer",
    grade: "Manager",
    primarySkill: "Node.js",
    sector: "Banking & Finance",
  },
  {
    id: 20714,
    resourceRequested: "Consultant",
    durationStart: "03 Feb 25",
    durationEnd: "26 Mar 25",
    hoursPerDay: "48m",
    approvalStatus: "todo",
    requestType: "New team member",
    bookingType: "Confirmed",
    projectName: "Test RL - ESG",
    projectColor: "#ef4444",
    hours: "30h 24m",
    requestedBy: "Sarah Chen",
    requestedDate: "15 Jan 2025, 5:00 PM",
    role: "Consultant",
    grade: "Associate",
    primarySkill: "Tax Advisory",
    sector: "Government",
  },
  {
    id: 18318,
    resourceRequested: "Consultant",
    durationStart: "13 Jan 25",
    durationEnd: "28 Feb 25",
    hoursPerDay: "48m",
    approvalStatus: "todo",
    requestType: "New team member",
    bookingType: "Unconfirmed",
    projectName: "Test zoho Deluge",
    projectColor: "#3b82f6",
    hours: "28h 00m",
    requestedBy: "John Smith",
    requestedDate: "5 Jan 2025, 9:50 AM",
    role: "Consultant",
    grade: "Manager",
    primarySkill: "Cybersecurity",
    sector: "Telecom",
  },
];
