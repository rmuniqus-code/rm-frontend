// Chargeability Data
export const chargeabilityData = [
  { department: "ARC (All Teams)", current: 82, previous: 83 },
  { department: "HRC", current: 62, previous: 62 },
  { department: "Tech Consulting", current: 67, previous: 53 },
  { department: "SCC", current: 60, previous: 68 },
];

export const chargeabilitySubData = [
  { department: "ARC - FS", current: 73, previous: 86 },
  { department: "ARC - FT", current: 83, previous: 74 },
];

// Timesheet Compliance Data
export const complianceData = [
  { department: "ARC (All teams)", current: 97, previous: 95 },
  { department: "SCC", current: 100, previous: 99 },
  { department: "HRC", current: 99, previous: 81 },
  { department: "Tech Consulting", current: 98, previous: 98 },
];

export const complianceSubData = [
  { department: "ARC - FS", current: 90, previous: 94 },
  { department: "ARC - FT", current: 100, previous: 98 },
];

// Timesheet Not Filled by Department & Designation
export const timesheetNotFilledData: Array<{
  name: string; empId: string; department: string; designation: string;
  compliancePct: number; period: string; wc1: number | null; wc8: number | null
}> = [
  { name: 'Mock Employee 1', empId: '', department: 'ARC', designation: 'Analyst', compliancePct: 0, period: 'Mock', wc1: 2, wc8: null },
  { name: 'Mock Employee 2', empId: '', department: 'ARC', designation: 'Consultant', compliancePct: 0, period: 'Mock', wc1: 10, wc8: 8 },
  { name: 'Mock Employee 3', empId: '', department: 'HRC', designation: 'Assistant Manager', compliancePct: 0, period: 'Mock', wc1: 5, wc8: 3 },
];

// Chargeability Trend by Designation
export const chargeabilityTrendData = [
  { department: "Tech Consulting", designation: "Analyst", wc1: 75, wc8: 66, trend: "down" as const },
  { department: "", designation: "Associate Consultant", wc1: 82, wc8: 77, trend: "down" as const },
  { department: "", designation: "Consultant", wc1: 80, wc8: 79, trend: "down" as const },
  { department: "", designation: "Assistant Manager", wc1: 79, wc8: 77, trend: "down" as const },
  { department: "", designation: "Manager", wc1: 57, wc8: 54, trend: "down" as const },
  { department: "", designation: "Associate Director", wc1: 26, wc8: 27, trend: "up" as const },
];

// ARC Resource Allocation
export const arcAllTeamsData = [
  { location: "Bangalore", region: "India", analyst: null, assocConsultant: null, consultant: 8, asstManager: 4, manager: null, assocDirector: 1, total: 13 },
  { location: "Chennai", region: "India", analyst: null, assocConsultant: null, consultant: 1, asstManager: null, manager: null, assocDirector: null, total: 1 },
  { location: "Gurugram", region: "India", analyst: 1, assocConsultant: null, consultant: 3, asstManager: 3, manager: null, assocDirector: null, total: 7 },
  { location: "KSA", region: "Middle East", analyst: null, assocConsultant: 1, consultant: null, asstManager: null, manager: null, assocDirector: 1, total: 2 },
  { location: "Mumbai", region: "India", analyst: 1, assocConsultant: null, consultant: 3, asstManager: 7, manager: 2, assocDirector: 2, total: 15 },
  { location: "Pune", region: "India", analyst: null, assocConsultant: null, consultant: 2, asstManager: 2, manager: 1, assocDirector: null, total: 5 },
  { location: "UAE", region: "Middle East", analyst: null, assocConsultant: null, consultant: null, asstManager: 1, manager: 2, assocDirector: null, total: 3 },
  { location: "USA", region: "Americas", analyst: null, assocConsultant: 1, consultant: 2, asstManager: 1, manager: 2, assocDirector: null, total: 6 },
];

// Location Wise Breakdown
export const locationWiseData = [
  { location: "Bangalore", region: "India", available: 1, bdWork: null, bookedNoWork: null, leaver: 1, leaves: null, newJoiner: 6, noResponse: 1, projectNotOpen: 2, projectDelay: null, timesheetNotFilled: 2, timesheetReversed: null, total: 13 },
  { location: "Chennai", region: "India", available: null, bdWork: null, bookedNoWork: null, leaver: null, leaves: null, newJoiner: null, noResponse: null, projectNotOpen: null, projectDelay: null, timesheetNotFilled: 1, timesheetReversed: null, total: 1 },
  { location: "Gurugram", region: "India", available: 2, bdWork: null, bookedNoWork: 2, leaver: 1, leaves: null, newJoiner: null, noResponse: null, projectNotOpen: 1, projectDelay: null, timesheetNotFilled: null, timesheetReversed: 1, total: 7 },
  { location: "KSA", region: "Middle East", available: null, bdWork: null, bookedNoWork: 1, leaver: null, leaves: null, newJoiner: null, noResponse: null, projectNotOpen: null, projectDelay: 1, timesheetNotFilled: null, timesheetReversed: null, total: 2 },
  { location: "Mumbai", region: "India", available: 1, bdWork: 1, bookedNoWork: null, leaver: 1, leaves: null, newJoiner: 2, noResponse: 1, projectNotOpen: 3, projectDelay: 2, timesheetNotFilled: 3, timesheetReversed: 1, total: 15 },
  { location: "Pune", region: "India", available: 1, bdWork: null, bookedNoWork: null, leaver: null, leaves: 1, newJoiner: null, noResponse: null, projectNotOpen: 2, projectDelay: null, timesheetNotFilled: 1, timesheetReversed: null, total: 5 },
  { location: "UAE", region: "Middle East", available: null, bdWork: 2, bookedNoWork: 1, leaver: null, leaves: null, newJoiner: null, noResponse: null, projectNotOpen: null, projectDelay: null, timesheetNotFilled: null, timesheetReversed: null, total: 3 },
  { location: "USA", region: "Americas", available: null, bdWork: null, bookedNoWork: null, leaver: 1, leaves: null, newJoiner: null, noResponse: 3, projectNotOpen: null, projectDelay: null, timesheetNotFilled: 2, timesheetReversed: null, total: 6 },
];

// Employee Detail Data
export const employeeDetailData = [
  { department: "ARC", subFunction: "ARC - A", empId: "10050", name: "A", email: "a@abc.com", designation: "Assistant Manager", location: "Mumbai", dateOfJoining: "13-Mar-2023", status: "red" as const },
  { department: "Tech Consulting", subFunction: "AI Service", empId: "10585", name: "B", email: "b@abc.com", designation: "Senior AI Architect", location: "Bangalore", dateOfJoining: "24-Apr-2025", status: "red" as const },
  { department: "ARC", subFunction: "ARC - A", empId: "20041", name: "C", email: "c@abc.com", designation: "Manager", location: "Indiana", dateOfJoining: "01-Jul-2025", status: "red" as const },
  { department: "ARC", subFunction: "ARC - A", empId: "10729", name: "D", email: "d@abc.com", designation: "Consultant", location: "Chennai", dateOfJoining: "01-Dec-2025", status: "green" as const },
  { department: "ARC", subFunction: "ARC - A", empId: "10732", name: "E", email: "e@abc.com", designation: "Consultant", location: "Bangalore", dateOfJoining: "02-Dec-2025", status: "green" as const },
  { department: "ARC", subFunction: "ARC - A", empId: "10739", name: "F", email: "f@abc.com", designation: "Consultant", location: "Mumbai", dateOfJoining: "10-Dec-2025", status: "red" as const },
];
