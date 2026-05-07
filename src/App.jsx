import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Calendar,
  Users,
  Settings,
  Download,
  Copy,
  Zap,
  Trash2,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Building2,
  CheckCircle2,
  Info,
  MoveUp,
  MoveDown,
  Upload,
  FileJson,
  LogOut,
  Loader2,
  Cloud,
  CloudOff,
} from "lucide-react";
import * as XLSX from "xlsx";
import SignIn from "./SignIn.jsx";
import {
  isConfigured as supabaseConfigured,
  loadAllStaff,
  saveAllStaff,
  loadAllRules,
  saveAllRules,
  loadAllSchedules,
  saveOneSchedule,
  subscribeStaff,
  subscribeRules,
  subscribeSchedules,
  signOut as supabaseSignOut,
  getCurrentSession,
  onAuthChange,
} from "./supabase";

/* Font loading is handled by index.html; global styles live in index.css */

/* ============================================================
   Constants
============================================================ */
const ROLES = { TECH: "Tech", RN: "RN", FD: "FD" };

const LOCATIONS = ["Halton", "Augusta", "Clemson", "Spartanburg"];

const LOC_META = {
  Halton: { code: "GEC", name: "Halton", rooms: 5 },
  Augusta: { code: "GEC", name: "Augusta", rooms: 3 },
  Clemson: { code: "CEC", name: "Clemson", rooms: 1 },
  Spartanburg: { code: "SEC", name: "Spartanburg", rooms: 2 },
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri"];

/* ------------------------------------------------------------
   Per-location section templates (matches Excel structure)
------------------------------------------------------------ */
function buildLocationConfig(loc) {
  const rooms = LOC_META[loc].rooms;
  const procRoomSlots = Array.from({ length: rooms }, (_, i) => ({
    id: `rm${i + 1}`,
    label: `Procedure Room ${i + 1}`,
    roomHeader: true,
  }));
  const floatSlots = [
    { id: "f_open", label: "Opener" },
    ...Array.from({ length: rooms }, (_, i) => ({
      id: `f_r${i + 1}`,
      label: `Rm ${i + 1}`,
    })),
  ];
  if (loc === "Halton" || loc === "Augusta") {
    floatSlots.push({ id: "f_close", label: "Closer" });
  }
  const recoverySeats = Math.min(rooms, 5);
  const recoveryTechs = loc === "Halton" ? 4 : loc === "Augusta" ? 4 : loc === "Spartanburg" ? 3 : 2;

  // Front office configuration
  let frontOfficeSlots;
  if (loc === "Halton") {
    frontOfficeSlots = [
      { id: "fo1", label: "6:15am" },
      { id: "fo2", label: "6:15am" },
      { id: "fo3", label: "6:15am" },
      { id: "fo4", label: "6:30am" },
      { id: "fo5", label: "6:30am" },
      { id: "fo_scan", label: "Scan", fixed: true },
    ];
  } else if (loc === "Augusta") {
    frontOfficeSlots = [
      { id: "fo1", label: "6:30am" },
      { id: "fo2", label: "6:30am" },
      { id: "fo3", label: "7:00am" },
    ];
  } else if (loc === "Clemson") {
    frontOfficeSlots = [
      { id: "fo1", label: "6:30am" },
      { id: "fo2", label: "6:30am" },
    ];
  } else {
    frontOfficeSlots = [
      { id: "fo1", label: "6:30am" },
      { id: "fo2", label: "6:30am" },
    ];
  }

  // Prep configuration
  let prepSlots;
  if (loc === "Halton") {
    prepSlots = [
      { id: "prep1", label: "" },
      { id: "prep2", label: "" },
      { id: "prep_ph", label: "PH" },
    ];
  } else if (loc === "Augusta") {
    prepSlots = [
      { id: "prep1", label: "6:45am" },
      { id: "prep_ph", label: "PH" },
    ];
  } else if (loc === "Clemson") {
    prepSlots = [{ id: "prep1", label: "6:45am" }];
  } else {
    prepSlots = [{ id: "prep1", label: "6:45am" }];
  }

  const sections = [
    {
      id: "frontOffice",
      label: "Front Office",
      role: ROLES.FD,
      rotating: true,
      slots: frontOfficeSlots,
    },
    {
      id: "prep",
      label: "Prep",
      role: ROLES.RN,
      rotating: false,
      slots: prepSlots,
    },
    {
      id: "procRooms",
      label: "Procedure Rooms",
      role: ROLES.RN,
      rotating: false,
      slots: procRoomSlots,
    },
    {
      id: "float",
      label: "Float",
      role: ROLES.TECH,
      rotating: true,
      slots: floatSlots,
    },
    {
      id: "recovery",
      label: "Recovery",
      role: "RN_OR_TECH",
      rotating: true,
      slots: [
        ...Array.from({ length: recoverySeats }, (_, i) => ({
          id: `r_s${i + 1}`,
          label: `Seat ${i + 1}`,
          allowedRole: ROLES.RN,
        })),
        ...Array.from({ length: recoveryTechs }, (_, i) => ({
          id: `r_t${i + 1}`,
          label: "Tech",
          allowedRole: "ANY",
        })),
      ],
    },
  ];

  if (loc === "Halton") {
    sections.push({
      id: "precalls",
      label: "Precalls",
      role: ROLES.RN,
      rotating: false,
      slots: [{ id: "pc1", label: "" }],
    });
  }

  return {
    name: loc,
    code: LOC_META[loc].code,
    rooms,
    sections,
  };
}

const LOCATION_CONFIGS = Object.fromEntries(
  LOCATIONS.map((loc) => [loc, buildLocationConfig(loc)])
);

/* ============================================================
   Initial staff list (from EE list + schedule observations)
============================================================ */
const INITIAL_STAFF = [
  // Techs
  { id: "t1", display: "Tonda B", fullName: "Bagwell, Tonda", role: ROLES.TECH, primary: "Clemson", eligible: ["Clemson"] },
  { id: "t2", display: "Pamela B", fullName: "Black, Pamela", role: ROLES.TECH, primary: "Clemson", eligible: ["Clemson"] },
  { id: "t3", display: "Rylee B", fullName: "Bodony, Rylee", role: ROLES.TECH, primary: "Augusta", eligible: ["Augusta"] },
  { id: "t4", display: "Lauren B", fullName: "Butterfield, Lauren", role: ROLES.TECH, primary: "Augusta", eligible: ["Augusta"] },
  { id: "t5", display: "Janna C", fullName: "Cartee, Janna", role: ROLES.TECH, primary: "Halton", eligible: ["Halton"] },
  { id: "t6", display: "Kylee C", fullName: "Chapman, Kylee", role: ROLES.TECH, primary: "Augusta", eligible: ["Augusta"] },
  { id: "t7", display: "Brooke C", fullName: "Craft, Brooke", role: ROLES.TECH, primary: "Clemson", eligible: ["Clemson"] },
  { id: "t8", display: "Tykia C", fullName: "Curenton, Tykia", role: ROLES.TECH, primary: "Halton", eligible: ["Halton"] },
  { id: "t9", display: "Wanda E", fullName: "Ely, Wanda", role: ROLES.TECH, primary: "Augusta", eligible: ["Augusta"] },
  { id: "t10", display: "Maritza F", fullName: "Flores, Maritza", role: ROLES.TECH, primary: "Halton", eligible: ["Halton"] },
  { id: "t11", display: "Ashley F", fullName: "Franklin, Ashley", role: ROLES.TECH, primary: "Halton", eligible: ["Halton"] },
  { id: "t12", display: "Desi F", fullName: "Franklin, Desi", role: ROLES.TECH, primary: "Halton", eligible: ["Halton"] },
  { id: "t13", display: "Tina G", fullName: "Green, Tina", role: ROLES.TECH, primary: "Halton", eligible: ["Halton"] },
  { id: "t14", display: "Casey G", fullName: "Greene, Casey", role: ROLES.TECH, primary: "Halton", eligible: ["Halton"] },
  { id: "t15", display: "Kea H", fullName: "Harris, Keavonta", role: ROLES.TECH, primary: "Halton", eligible: ["Halton"] },
  { id: "t16", display: "Nicole H", fullName: "Harrison, Nicole", role: ROLES.TECH, primary: "Halton", eligible: ["Halton", "Spartanburg"] },
  { id: "t17", display: "Paige J", fullName: "James, Paige", role: ROLES.TECH, primary: "Augusta", eligible: ["Augusta", "Spartanburg"] },
  { id: "t18", display: "Titia J", fullName: "Jones, Titia", role: ROLES.TECH, primary: "Augusta", eligible: ["Augusta", "Spartanburg"] },
  { id: "t19", display: "Claire M", fullName: "Marsh, Clair", role: ROLES.TECH, primary: "Augusta", eligible: ["Augusta"] },
  { id: "t20", display: "Paige M", fullName: "Martin, Paige", role: ROLES.TECH, primary: "Augusta", eligible: ["Augusta"] },
  { id: "t21", display: "Karlee M", fullName: "Mckee, Karlee", role: ROLES.TECH, primary: "Augusta", eligible: ["Augusta"] },
  { id: "t22", display: "Zachary M", fullName: "Meininger, Zachary", role: ROLES.TECH, primary: "Augusta", eligible: ["Augusta"] },
  { id: "t23", display: "Sara M", fullName: "Mills, Sara", role: ROLES.TECH, primary: "Augusta", eligible: ["Augusta", "Clemson"] },
  { id: "t24", display: "Kenny M", fullName: "Moses, Kenny", role: ROLES.TECH, primary: "Halton", eligible: ["Halton"] },
  { id: "t25", display: "Krishna P", fullName: "Patel, Krishna", role: ROLES.TECH, primary: "Halton", eligible: ["Halton"] },
  { id: "t26", display: "Nikki P", fullName: "Patel, Nikita", role: ROLES.TECH, primary: "Halton", eligible: ["Halton"] },
  { id: "t27", display: "Scidone P", fullName: "Perez, Scidone", role: ROLES.TECH, primary: "Halton", eligible: ["Halton", "Augusta", "Spartanburg"] },
  { id: "t28", display: "Tori P", fullName: "Principi, Tori", role: ROLES.TECH, primary: "Halton", eligible: ["Halton", "Spartanburg"] },
  { id: "t29", display: "Morgan R", fullName: "Robinson, Morgan", role: ROLES.TECH, primary: "Halton", eligible: ["Halton"] },
  { id: "t30", display: "Chevana S", fullName: "Sapp, Chevana", role: ROLES.TECH, primary: "Augusta", eligible: ["Augusta"] },
  { id: "t31", display: "Cheryl S", fullName: "Schwartz, Cheryl", role: ROLES.TECH, primary: "Halton", eligible: ["Halton"] },
  { id: "t32", display: "Lindsay W", fullName: "Wallace, Lindsay", role: ROLES.TECH, primary: "Clemson", eligible: ["Clemson"] },
  { id: "t33", display: "Tia Y", fullName: "Young, Tia", role: ROLES.TECH, primary: "Halton", eligible: ["Halton"] },

  // RNs
  { id: "n1", display: "Sarah B", fullName: "Bowles, Sarah", role: ROLES.RN, primary: "Halton", eligible: ["Halton"] },
  { id: "n2", display: "Lindsay B", fullName: "Bryant, Lindsay", role: ROLES.RN, primary: "Halton", eligible: ["Halton"] },
  { id: "n3", display: "Thomas C", fullName: "Cushman, Thomas", role: ROLES.RN, primary: "Halton", eligible: ["Halton"] },
  { id: "n4", display: "Georgia G", fullName: "Garner, Georgia", role: ROLES.RN, primary: "Augusta", eligible: ["Augusta"] },
  { id: "n5", display: "Ellison G", fullName: "Gilliard, Ellison", role: ROLES.RN, primary: "Halton", eligible: ["Halton"] },
  { id: "n6", display: "Victoria G", fullName: "Gomez, Victoria", role: ROLES.RN, primary: "Halton", eligible: ["Halton"] },
  { id: "n7", display: "Greyson G", fullName: "Griffin, Greyson", role: ROLES.RN, primary: "Halton", eligible: ["Halton"] },
  { id: "n8", display: "Heather H", fullName: "Harbin, Heather", role: ROLES.RN, primary: "Clemson", eligible: ["Clemson"] },
  { id: "n9", display: "Hope H", fullName: "Herren, Hope", role: ROLES.RN, primary: "Augusta", eligible: ["Augusta", "Clemson"] },
  { id: "n10", display: "Chelsea H", fullName: "Howard, Chelsea", role: ROLES.RN, primary: "Halton", eligible: ["Halton"], notes: "New hire" },
  { id: "n11", display: "Morgan J", fullName: "Johnson, Morgan", role: ROLES.RN, primary: "Augusta", eligible: ["Augusta"] },
  { id: "n12", display: "Sharon J", fullName: "Johnson, Sharon", role: ROLES.RN, primary: "Augusta", eligible: ["Augusta"] },
  { id: "n13", display: "Natasha K", fullName: "Kilgore, Natasha", role: ROLES.RN, primary: "Halton", eligible: ["Halton"] },
  { id: "n14", display: "Carly K", fullName: "Kopscik, Carly", role: ROLES.RN, primary: "Augusta", eligible: ["Augusta"] },
  { id: "n15", display: "Toni L", fullName: "Leonard, Toni", role: ROLES.RN, primary: "Augusta", eligible: ["Augusta"] },
  { id: "n16", display: "Taylor L", fullName: "Lewis, Taylor", role: ROLES.RN, primary: "Halton", eligible: ["Halton"] },
  { id: "n17", display: "Paula M", fullName: "McConnell, Paula", role: ROLES.RN, primary: "Halton", eligible: ["Halton"] },
  { id: "n18", display: "Jessica M", fullName: "Moore, Jessica", role: ROLES.RN, primary: "Halton", eligible: ["Halton"] },
  { id: "n19", display: "Danielle M", fullName: "Murray, Danielle", role: ROLES.RN, primary: "Augusta", eligible: ["Augusta"] },
  { id: "n20", display: "Erin P", fullName: "Philpot, Erin", role: ROLES.RN, primary: "Augusta", eligible: ["Augusta"] },
  { id: "n21", display: "Shawna P", fullName: "Price, Shawna", role: ROLES.RN, primary: "Halton", eligible: ["Halton", "Spartanburg"] },
  { id: "n22", display: "Chandler S", fullName: "Schoen, Chandler", role: ROLES.RN, primary: "Halton", eligible: ["Halton"] },
  { id: "n23", display: "Allee S", fullName: "Shaver, Allee", role: ROLES.RN, primary: "Halton", eligible: ["Halton", "Spartanburg"] },
  { id: "n24", display: "Ellen S", fullName: "Snyder, Ellen", role: ROLES.RN, primary: "Halton", eligible: ["Halton"] },
  { id: "n25", display: "Maria S", fullName: "Suchanek, Maria", role: ROLES.RN, primary: "Halton", eligible: ["Halton"] },
  { id: "n26", display: "Hannah S", fullName: "Swinney, Hannah", role: ROLES.RN, primary: "Clemson", eligible: ["Clemson"] },
  { id: "n27", display: "Amy W", fullName: "Weichmann, Amy", role: ROLES.RN, primary: "Halton", eligible: ["Halton", "Augusta"] },

  // Front Desk
  { id: "f1", display: "Melissa B", fullName: "Bayne, Melissa", role: ROLES.FD, primary: "Augusta", eligible: ["Augusta"] },
  { id: "f2", display: "Tash B", fullName: "Blandin, Tash", role: ROLES.FD, primary: "Halton", eligible: ["Halton"] },
  { id: "f3", display: "Shelley BD", fullName: "Brown, Shelley", role: ROLES.FD, primary: "Halton", eligible: ["Halton", "Spartanburg"] },
  { id: "f4", display: "Tracy C", fullName: "Covington, Tracy", role: ROLES.FD, primary: "Augusta", eligible: ["Augusta"] },
  { id: "f5", display: "Tina D", fullName: "Durham, Tina", role: ROLES.FD, primary: "Clemson", eligible: ["Clemson"] },
  { id: "f6", display: "Kayla H", fullName: "Harris, Kayla", role: ROLES.FD, primary: "Halton", eligible: ["Halton"] },
  { id: "f7", display: "Reachell H", fullName: "Howard, Reachelle", role: ROLES.FD, primary: "Augusta", eligible: ["Augusta"] },
  { id: "f8", display: "Emma N", fullName: "Nease, Emma", role: ROLES.FD, primary: "Halton", eligible: ["Halton"] },
  { id: "f9", display: "Vernelle S", fullName: "Sanders, Vernelle", role: ROLES.FD, primary: "Halton", eligible: ["Halton"] },
  { id: "f10", display: "Chrystal T", fullName: "Townes, Chrystal", role: ROLES.FD, primary: "Halton", eligible: ["Halton"] },
];

/* ============================================================
   Initial rules (room owners, rotation orders)
============================================================ */
const INITIAL_RULES = {
  roomOwners: {
    Halton: { rm1: "t27", rm2: "t26", rm3: "t15", rm4: "t29", rm5: "t28" },
    Augusta: { rm1: "t4", rm2: "t23", rm3: "t18" },
    Clemson: { rm1: "t1" },
    Spartanburg: { rm1: "t18", rm2: "" },
  },
  rotationOrders: {
    Halton: {
      frontOffice: ["f6", "f3", "f2", "f9", "f8", "f10"],
      float: ["t13", "t14", "t24", "t11", "t25", "t10"],
      floatFixed: { f_close: "t12" },
      recovery: ["n22", "n5", "n21", "n27", "n25", "n17"],
    },
    Augusta: {
      frontOffice: ["f4", "f1", "f7"],
      float: ["t9", "t19", "t6", "t22"],
      floatFixed: {},
      recovery: ["n20", "n12", "n14", "n19", "n4", "n11"],
    },
    Clemson: {
      frontOffice: ["f5"],
      float: ["t2", "t32"],
      floatFixed: {},
      recovery: ["n8"],
    },
    Spartanburg: {
      frontOffice: ["f3"],
      float: ["t27", "t16", "t28"],
      floatFixed: {},
      recovery: ["n21"],
    },
  },
};

/* ============================================================
   Date utilities
============================================================ */

// Parse "YYYY-MM-DD" as a LOCAL-time date.
// new Date("2026-05-04") parses as UTC midnight, which becomes the
// previous evening in any westward time zone — that's what was causing
// week labels to drift off by a day.
function parseLocalDate(input) {
  if (input instanceof Date) return new Date(input.getTime());
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(input);
}

function getMonday(d) {
  const date = parseLocalDate(d);
  const day = date.getDay();          // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function weekKey(mondayDate) {
  const m = parseLocalDate(mondayDate);
  const y = m.getFullYear();
  const mo = String(m.getMonth() + 1).padStart(2, "0");
  const d = String(m.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function formatDateShort(d) {
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

function formatWeekRange(mondayDate) {
  const m = parseLocalDate(mondayDate);
  const friday = new Date(m);
  friday.setDate(friday.getDate() + 4);
  return `${formatDateShort(m)} – ${formatDateShort(friday)}`;
}

function getDayDates(mondayDate) {
  const m = parseLocalDate(mondayDate);
  return DAY_KEYS.map((_, i) => {
    const d = new Date(m);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/* ============================================================
   Empty schedule factory
============================================================ */
function emptyLocationSchedule(loc) {
  const config = LOCATION_CONFIGS[loc];
  const schedule = { sections: {}, notes: ["", "", "", "", ""], doctors: {} };
  config.sections.forEach((section) => {
    schedule.sections[section.id] = {};
    section.slots.forEach((slot) => {
      schedule.sections[section.id][slot.id] = ["", "", "", "", ""];
    });
  });
  for (let i = 1; i <= config.rooms; i++) {
    schedule.doctors[`rm${i}`] = ["", "", "", "", ""];
  }
  return schedule;
}

/* ============================================================
   Seed schedule (5/4/26 Halton example)
============================================================ */
function buildSeedSchedules() {
  const seed = {};
  const seedWeek = "2026-05-04";
  seed[seedWeek] = {};

  // Halton
  const h = emptyLocationSchedule("Halton");
  h.sections.frontOffice = {
    fo1: ["Kayla H", "Emma N", "Vernelle S", "Tash B", "Tia Y"],
    fo2: ["Shelley BD", "Kayla H", "Emma N", "Vernelle S", "Tash B"],
    fo3: ["Tash B", "Shelley BD", "Kayla H", "Emma N", "Vernelle S"],
    fo4: ["Vernelle S", "Tash B", "Shelley BD", "Kayla H", "Emma N"],
    fo5: ["Emma N", "Vernelle S", "Tash B", "Shelley BD", "Kayla H"],
    fo_scan: ["Chrystal T", "Chrystal T", "Chrystal T", "Chrystal T", "Chrystal T"],
  };
  h.sections.prep = {
    prep1: ["Allee S", "Allee S", "Allee S", "Allee S", "Allee S"],
    prep2: ["Greyson G", "Greyson G", "Greyson G", "Greyson G", "Greyson G"],
    prep_ph: ["Ellen S", "Ellen S", "Ellen S", "Ellen S", "Sarah B"],
  };
  h.sections.procRooms = {
    rm1: ["Scidone P", "Scidone P", "Scidone P", "Nicole H", "Scidone P"],
    rm2: ["Nikki P", "Nikki P", "Nikki P", "Nikki P", "Nikki P"],
    rm3: ["Kea H", "Kea H", "Kea H", "Kea H", "Kea H"],
    rm4: ["Morgan R", "Cheryl S", "Morgan R", "Morgan R", "Nicole H"],
    rm5: ["Tori P", "Tori P", "Tori P", "Tori P", "Shelley BD"],
  };
  h.sections.float = {
    f_open: ["Tina G", "Maritza F", "Krishna P", "Ashley F", "Kenny M"],
    f_r1: ["Casey G", "Tina G", "Maritza F", "Krishna P", "Ashley F"],
    f_r2: ["Kenny M", "Casey G", "Tina G", "Maritza F", "Krishna P"],
    f_r3: ["Ashley F", "Kenny M", "Casey G", "Tina G", "Maritza F"],
    f_r4: ["Krishna P", "Ashley F", "Kenny M", "Casey G", "Tina G"],
    f_r5: ["Maritza F", "Krishna P", "Ashley F", "Kenny M", "Casey G"],
    f_close: ["Desi F", "Desi F", "Desi F", "Desi F", "Desi F"],
  };
  h.sections.recovery = {
    r_s1: ["Chandler S", "Lindsay B", "Maria S", "Paula M", "Shawna P"],
    r_s2: ["Ellison G", "Chandler S", "Lindsay B", "Maria S", "Paula M"],
    r_s3: ["Shawna P", "Ellison G", "Chandler S", "Lindsay B", "Maria S"],
    r_s4: ["Amy W", "Shawna P", "Ellison G", "Chandler S", "Lindsay B"],
    r_s5: ["Maria S", "Amy W", "Shawna P", "Ellison G", "Chandler S"],
    r_t1: ["Lindsay B", "Maria S", "Amy W", "Shawna P", "Ellison G"],
    r_t2: ["Cheryl S", "Tia Y", "Paula M", "Tia Y", "Ellen S"],
    r_t3: ["Tia Y", "", "Tia Y", "", ""],
    r_t4: ["", "", "", "", ""],
  };
  h.sections.precalls = {
    pc1: ["Natasha K", "Natasha K", "Natasha K", "Natasha K", "Natasha K"],
  };
  h.notes = [
    "Lindsay out at 2",
    "Tia out at 230",
    "Krishna out at 230\nWelcome Chelsea, RN",
    "Chelsea w/Allee",
    "Tori off\nChelsea w/Allee",
  ];
  h.doctors = {
    rm1: ["GEIST", "GULLEY/FYOCK", "GAINES", "GEIST/JONES", "BARNES"],
    rm2: ["HORTON", "JONES", "KOVALIC/BARNES", "HORTON/SUNKAVALLI", "GULLEY"],
    rm3: ["LEBEL", "KOVALIC", "LEBEL/VALLABH", "MADIGAN", "MADIGAN"],
    rm4: ["MERCHANT/GULLEY", "PALMA/GAINES", "MAZANEC", "MERCHANT", "MAZANEC"],
    rm5: ["VALLABH/MAZANEC", "VITORSKY/SUNKAVALLI", "SUNKAVALLI", "VALLABH", "VITORSKY"],
  };
  seed[seedWeek].Halton = h;

  // Augusta
  const a = emptyLocationSchedule("Augusta");
  a.sections.frontOffice = {
    fo1: ["Tracy C", "Reachell H", "Melissa B", "Tracy C", "Reachell H"],
    fo2: ["Melissa B", "Tracy C", "Reachell H", "Melissa B", "Tracy C"],
    fo3: ["Reachell H", "Melissa B", "Tracy C", "Reachell H", "Melissa B"],
  };
  a.sections.prep = {
    prep1: ["Hope H", "Hope H", "Hope H", "Amy W", "Amy W"],
    prep_ph: ["Paige M", "Paige M", "Paige M", "Paige M", ""],
  };
  a.sections.procRooms = {
    rm1: ["Lauren B", "Lauren B", "Lauren B", "Lauren B", "Lauren B"],
    rm2: ["Sara M", "Sara M", "Sara M", "Scidone P", "Zachary M"],
    rm3: ["Titia J", "Titia J", "Titia J", "Titia J", "Titia J"],
  };
  a.sections.float = {
    f_open: ["Wanda E", "Zachary M", "Kylee C", "Rylee B", "Wanda E"],
    f_r1: ["Claire M", "Wanda E", "Zachary M", "Kylee C", "Rylee B"],
    f_r2: ["Kylee C", "Claire M", "Wanda E", "Zachary M", "Kylee C"],
    f_r3: ["Zachary M", "Kylee C", "Claire M", "Wanda E", "Chevana S"],
  };
  a.sections.recovery = {
    r_s1: ["Erin P", "Danielle M", "Carly K", "Sharon J", "Morgan J"],
    r_s2: ["Sharon J", "Morgan J", "Georgia G", "Carly K", "Sharon J"],
    r_s3: ["Carly K", "Erin P", "Morgan J", "Georgia G", "Erin P"],
    r_t1: ["Danielle M", "Carly K", "Sharon J", "Morgan J", ""],
    r_t2: ["", "", "Rylee B", "Erin P", "Danielle M"],
    r_t3: ["", "", "", "", ""],
    r_t4: ["Paige J", "Paige J", "Paige J", "Paige J", ""],
  };
  a.notes = [
    "Karlee in at 10\nGeorgia off\nKarlee EUS\nWK 3 Chevana w/Zach",
    "Paige in at 1130\nSharon off\nGeorgia off\nKarlee EUS\nWK 3 Chevana w/Zach",
    "Kylee out at 3\nErin off\nKarlee EUS\nWK 3 Chevana w/Zach",
    "Karlee EUS\nWK 3 Chevana w/Zach",
    "Paige J off\nCarly off\nKarlee off\nGeorgia off",
  ];
  a.doctors = {
    rm1: ["BRACKBILL", "BRACKBILL/GEIST", "GULLEY/PALMA", "FYOCK/PALMA", "GEIST"],
    rm2: ["SAHA/BARNES", "LEBEL/MERCHANT", "JONES", "BARNES", "KOVALIC"],
    rm3: ["SUNKAVALLI/KOVALIC", "MAZANEC/VALLABH", "VITORSKY/HORTON", "MAZANEC/VITORSKY", "SAHA"],
  };
  seed[seedWeek].Augusta = a;

  // Clemson
  const c = emptyLocationSchedule("Clemson");
  c.sections.frontOffice = {
    fo1: ["Tina D", "Tina D", "Tina D", "Tina D", "Tina D"],
    fo2: ["", "", "", "", ""],
  };
  c.sections.prep = {
    prep1: ["Hannah S", "Hannah S", "Hannah S", "Hope H", "Hope H"],
  };
  c.sections.procRooms = {
    rm1: ["Tonda B", "Tonda B", "Tonda B", "Tonda B", "Tonda B"],
  };
  c.sections.float = {
    f_open: ["Pamela B", "Lindsay W", "Pamela B", "Lindsay W", "Brooke C"],
    f_r1: ["Lindsay W", "Pamela B", "Lindsay W", "Brooke C", "Lindsay W"],
  };
  c.sections.recovery = {
    r_s1: ["Heather H", "Heather H", "Heather H", "Heather H", "Heather H"],
    r_t1: ["", "", "", "", ""],
    r_t2: ["Brooke C", "Brooke C", "Brooke C", "Sara M", "Sara M"],
  };
  c.notes = ["", "", "", "Pamela off", "Pamela off"];
  c.doctors = {
    rm1: ["JONES/GAINES", "BARNES/HORTON", "FYOCK/GEIST", "GAINES/LEBEL", "HORTON"],
  };
  seed[seedWeek].Clemson = c;

  // Spartanburg (blank)
  seed[seedWeek].Spartanburg = emptyLocationSchedule("Spartanburg");

  return seed;
}

/* ============================================================
   Cloud persistence: debounced helpers
   --------------------------------------------------------------
   - Reads come from Supabase on initial load + realtime updates
   - Writes are debounced by 600ms so rapid edits don't spam the API
============================================================ */

function debounce(fn, wait) {
  let t;
  const debounced = (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => t && clearTimeout(t);
  debounced.flush = (...args) => {
    if (t) clearTimeout(t);
    fn(...args);
  };
  return debounced;
}

/* ============================================================
   Main App
============================================================ */
export default function App() {
  /* ---- Auth state ---- */
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);

  /* ---- Application state ---- */
  const [view, setView] = useState("schedule"); // 'schedule' | 'staff' | 'rules'
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [staff, setStaff] = useState(INITIAL_STAFF);
  const [rules, setRules] = useState(INITIAL_RULES);
  const [schedules, setSchedules] = useState({});
  const [currentWeek, setCurrentWeek] = useState(() =>
    weekKey(getMonday(new Date(2026, 4, 4)))
  );
  const [currentLocation, setCurrentLocation] = useState("Halton");
  const [toast, setToast] = useState(null);

  /* ---- Cloud sync status: 'idle' | 'saving' | 'saved' | 'error' | 'remote' ---- */
  const [syncStatus, setSyncStatus] = useState("idle");
  const lastLocalEditRef = useRef(0);

  // Marks "we just saved" to suppress the realtime echo from triggering a refetch
  const markLocalEdit = () => {
    lastLocalEditRef.current = Date.now();
  };
  const isRecentLocalEdit = () => Date.now() - lastLocalEditRef.current < 1500;

  /* ============================================================
     1. Auth bootstrap
  ============================================================ */
  useEffect(() => {
    if (!supabaseConfigured) {
      // Show config error rather than infinitely "Loading..."
      setAuthReady(true);
      return;
    }
    let unsub;
    (async () => {
      try {
        const sess = await getCurrentSession();
        setSession(sess);
      } catch (e) {
        console.warn("Could not read existing session:", e);
      }
      unsub = onAuthChange((s) => setSession(s));
      setAuthReady(true);
    })();
    return () => unsub && unsub();
  }, []);

  /* ============================================================
     2. Initial cloud load (runs after sign-in)
  ============================================================ */
  const refreshAll = useCallback(async () => {
    try {
      const [s, r, sc] = await Promise.all([
        loadAllStaff(),
        loadAllRules(),
        loadAllSchedules(),
      ]);

      // Staff: if cloud is empty, seed with INITIAL_STAFF and save
      if (s.length === 0) {
        await saveAllStaff(INITIAL_STAFF);
        setStaff(INITIAL_STAFF);
      } else {
        setStaff(s);
      }

      // Rules: if cloud has nothing for any location, seed
      const hasAnyRules =
        Object.keys(r.roomOwners || {}).length > 0 ||
        Object.keys(r.rotationOrders || {}).length > 0;
      if (!hasAnyRules) {
        await saveAllRules(INITIAL_RULES);
        setRules(INITIAL_RULES);
      } else {
        // Merge cloud rules over the defaults so any missing location keys
        // still have an empty entry to work with
        setRules({
          roomOwners: { ...INITIAL_RULES.roomOwners, ...r.roomOwners },
          rotationOrders: { ...INITIAL_RULES.rotationOrders, ...r.rotationOrders },
        });
      }

      // Schedules: if cloud is empty, seed the example week
      if (Object.keys(sc).length === 0) {
        const seed = buildSeedSchedules();
        // Save each week+location to the cloud
        for (const [week, byLoc] of Object.entries(seed)) {
          for (const [loc, data] of Object.entries(byLoc)) {
            await saveOneSchedule(week, loc, data);
          }
        }
        setSchedules(seed);
      } else {
        setSchedules(sc);
      }

      setLoaded(true);
      setLoadError(null);
    } catch (e) {
      console.error("Failed to load from Supabase:", e);
      setLoadError(e.message || String(e));
    }
  }, []);

  useEffect(() => {
    if (!session || !supabaseConfigured) return;
    setLoaded(false);
    refreshAll();
  }, [session, refreshAll]);

  /* ============================================================
     3. Realtime subscriptions
  ============================================================ */
  useEffect(() => {
    if (!session || !loaded) return;
    const unsubs = [];

    unsubs.push(
      subscribeStaff(async () => {
        if (isRecentLocalEdit()) return;
        try {
          const s = await loadAllStaff();
          setStaff(s);
          setSyncStatus("remote");
        } catch (e) {
          console.warn(e);
        }
      })
    );

    unsubs.push(
      subscribeRules(async () => {
        if (isRecentLocalEdit()) return;
        try {
          const r = await loadAllRules();
          setRules({
            roomOwners: { ...INITIAL_RULES.roomOwners, ...r.roomOwners },
            rotationOrders: { ...INITIAL_RULES.rotationOrders, ...r.rotationOrders },
          });
          setSyncStatus("remote");
        } catch (e) {
          console.warn(e);
        }
      })
    );

    unsubs.push(
      subscribeSchedules(async (payload) => {
        if (isRecentLocalEdit()) return;
        // For schedules we can apply the patch directly without a full refetch
        const row = payload?.new || payload?.old;
        if (!row?.week || !row?.location) return;
        if (payload.eventType === "DELETE") {
          setSchedules((prev) => {
            const next = { ...prev };
            if (next[row.week]) {
              const newWeek = { ...next[row.week] };
              delete newWeek[row.location];
              if (Object.keys(newWeek).length === 0) {
                delete next[row.week];
              } else {
                next[row.week] = newWeek;
              }
            }
            return next;
          });
        } else {
          setSchedules((prev) => ({
            ...prev,
            [row.week]: { ...(prev[row.week] || {}), [row.location]: row.data },
          }));
        }
        setSyncStatus("remote");
      })
    );

    return () => unsubs.forEach((u) => u && u());
  }, [session, loaded]);

  /* ============================================================
     4. Cloud writes (debounced)
  ============================================================ */
  const debouncedSaveStaff = useMemo(
    () =>
      debounce(async (s) => {
        try {
          setSyncStatus("saving");
          await saveAllStaff(s);
          setSyncStatus("saved");
          setTimeout(() => setSyncStatus("idle"), 1500);
        } catch (e) {
          console.error("Save staff failed:", e);
          setSyncStatus("error");
        }
      }, 600),
    []
  );

  const debouncedSaveRules = useMemo(
    () =>
      debounce(async (r) => {
        try {
          setSyncStatus("saving");
          await saveAllRules(r);
          setSyncStatus("saved");
          setTimeout(() => setSyncStatus("idle"), 1500);
        } catch (e) {
          console.error("Save rules failed:", e);
          setSyncStatus("error");
        }
      }, 600),
    []
  );

  useEffect(() => {
    if (!loaded || !session) return;
    markLocalEdit();
    debouncedSaveStaff(staff);
  }, [staff, loaded, session, debouncedSaveStaff]);

  useEffect(() => {
    if (!loaded || !session) return;
    markLocalEdit();
    debouncedSaveRules(rules);
  }, [rules, loaded, session, debouncedSaveRules]);

  /* ============================================================
     5. UI helpers
  ============================================================ */
  const showToast = useCallback((msg, kind = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const currentSchedule = useMemo(() => {
    return (
      schedules[currentWeek]?.[currentLocation] ||
      emptyLocationSchedule(currentLocation)
    );
  }, [schedules, currentWeek, currentLocation]);

  // Per-week-and-location debounced saver
  const scheduleSavers = useRef(new Map());
  const getScheduleSaver = (week, location) => {
    const key = `${week}::${location}`;
    if (!scheduleSavers.current.has(key)) {
      scheduleSavers.current.set(
        key,
        debounce(async (data) => {
          try {
            setSyncStatus("saving");
            await saveOneSchedule(week, location, data);
            setSyncStatus("saved");
            setTimeout(() => setSyncStatus("idle"), 1500);
          } catch (e) {
            console.error("Save schedule failed:", e);
            setSyncStatus("error");
          }
        }, 600)
      );
    }
    return scheduleSavers.current.get(key);
  };

  const updateSchedule = useCallback(
    (updater) => {
      setSchedules((prev) => {
        const weekData = prev[currentWeek] || {};
        const locData =
          weekData[currentLocation] || emptyLocationSchedule(currentLocation);
        const next = updater(JSON.parse(JSON.stringify(locData)));
        markLocalEdit();
        // Fire the cloud save (debounced)
        if (loaded && session) {
          getScheduleSaver(currentWeek, currentLocation)(next);
        }
        return {
          ...prev,
          [currentWeek]: { ...weekData, [currentLocation]: next },
        };
      });
    },
    [currentWeek, currentLocation, loaded, session]
  );

  /* ---- Validation: compute warnings for the current week ---- */
  const validation = useMemo(() => {
    const warns = [];
    const weekSchedules = schedules[currentWeek] || {};

    // cross-location double-booking: for each day, for each staff display name,
    // see if they appear in multiple locations
    DAY_KEYS.forEach((dayKey, dayIdx) => {
      const appearances = {}; // displayName -> [location, section, slot][]
      LOCATIONS.forEach((loc) => {
        const sched = weekSchedules[loc];
        if (!sched) return;
        const config = LOCATION_CONFIGS[loc];
        config.sections.forEach((section) => {
          section.slots.forEach((slot) => {
            const name = sched.sections?.[section.id]?.[slot.id]?.[dayIdx];
            if (name && name.trim()) {
              if (!appearances[name]) appearances[name] = [];
              appearances[name].push({ loc, section: section.label, slot: slot.label });
            }
          });
        });
      });
      Object.entries(appearances).forEach(([name, spots]) => {
        const locs = Array.from(new Set(spots.map((s) => s.loc)));
        if (locs.length > 1) {
          warns.push({
            type: "double_book",
            day: DAYS[dayIdx],
            name,
            locations: locs,
            message: `${name} is scheduled at ${locs.join(" & ")} on ${DAYS[dayIdx]}`,
          });
        }
      });
    });

    // Current-location warnings: role mismatch, eligibility, duplicate within loc
    const config = LOCATION_CONFIGS[currentLocation];
    const byName = {};
    staff.forEach((s) => (byName[s.display] = s));
    config.sections.forEach((section) => {
      section.slots.forEach((slot) => {
        DAY_KEYS.forEach((_dk, dayIdx) => {
          const name = currentSchedule.sections?.[section.id]?.[slot.id]?.[dayIdx];
          if (!name || !name.trim()) return;
          const s = byName[name];
          if (!s) {
            warns.push({
              type: "unknown",
              day: DAYS[dayIdx],
              name,
              message: `"${name}" not in staff list (${DAYS[dayIdx]}, ${section.label})`,
            });
            return;
          }
          if (!s.eligible.includes(currentLocation)) {
            warns.push({
              type: "ineligible",
              day: DAYS[dayIdx],
              name,
              message: `${name} not marked eligible for ${currentLocation} (${DAYS[dayIdx]}, ${section.label})`,
            });
          }
          // role check
          if (section.role === "RN_OR_TECH") {
            if (slot.allowedRole === ROLES.RN && s.role !== ROLES.RN && s.role !== ROLES.TECH) {
              // seat - allow RN or Tech but warn if not RN
            }
          } else if (section.role && s.role !== section.role) {
            warns.push({
              type: "role",
              day: DAYS[dayIdx],
              name,
              message: `${name} is ${s.role} but ${section.label} needs ${section.role} (${DAYS[dayIdx]})`,
            });
          }
        });
      });
    });

    return warns;
  }, [schedules, currentWeek, currentLocation, staff, currentSchedule]);

  /* ---- Actions ---- */
  const copyPreviousWeek = () => {
    const prevMonday = parseLocalDate(currentWeek);
    prevMonday.setDate(prevMonday.getDate() - 7);
    const prevKey = weekKey(prevMonday);
    const prev = schedules[prevKey]?.[currentLocation];
    if (!prev) {
      showToast("No previous week to copy from", "warn");
      return;
    }
    updateSchedule(() => JSON.parse(JSON.stringify(prev)));
    showToast(`Copied from week of ${formatDateShort(prevMonday)}`, "success");
  };

  const autoFillRotations = () => {
    updateSchedule((sched) => {
      const config = LOCATION_CONFIGS[currentLocation];
      const rot = rules.rotationOrders[currentLocation] || {};
      config.sections.forEach((section) => {
        if (!section.rotating) return;
        const rotatableSlots = section.slots.filter((sl) => !sl.fixed);
        const fixedSlots = section.slots.filter((sl) => sl.fixed);

        // Determine Monday's order
        let mondayOrder = rotatableSlots.map(
          (sl) => sched.sections[section.id][sl.id][0]
        );
        const allBlank = mondayOrder.every((x) => !x || !x.trim());
        if (allBlank) {
          // Seed from rules
          let ruleOrder = [];
          if (section.id === "frontOffice") ruleOrder = rot.frontOffice || [];
          if (section.id === "float") ruleOrder = rot.float || [];
          if (section.id === "recovery") ruleOrder = rot.recovery || [];
          const staffById = Object.fromEntries(staff.map((s) => [s.id, s.display]));
          mondayOrder = rotatableSlots.map(
            (_, i) => staffById[ruleOrder[i]] || ""
          );
          rotatableSlots.forEach((sl, i) => {
            sched.sections[section.id][sl.id][0] = mondayOrder[i];
          });
        }

        // Advance each subsequent day
        let prevOrder = [...mondayOrder];
        for (let d = 1; d < 5; d++) {
          const last = prevOrder[prevOrder.length - 1];
          const newOrder = [last, ...prevOrder.slice(0, -1)];
          rotatableSlots.forEach((sl, i) => {
            sched.sections[section.id][sl.id][d] = newOrder[i];
          });
          prevOrder = newOrder;
        }

        // Apply fixed slots
        fixedSlots.forEach((sl) => {
          let name = "";
          if (section.id === "float") {
            const fixed = rot.floatFixed?.[sl.id];
            name = staff.find((s) => s.id === fixed)?.display || sched.sections[section.id][sl.id][0] || "";
          } else if (sl.id === "fo_scan") {
            // Keep whatever is there (don't overwrite); if blank, use staff named Chrystal T by default
            name = sched.sections[section.id][sl.id][0] || "";
          }
          if (name) {
            sched.sections[section.id][sl.id] = [name, name, name, name, name];
          }
        });
      });
      return sched;
    });
    showToast("Rotations auto-filled based on Monday's roster", "success");
  };

  const clearWeek = () => {
    if (!confirm("Clear all assignments for this location this week?")) return;
    updateSchedule(() => emptyLocationSchedule(currentLocation));
    showToast("Week cleared", "info");
  };

  /* ---- JSON export/import for sharing state between supervisors ---- */
  const fileInputRef = useRef(null);

  const exportAllData = () => {
    try {
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        staff,
        rules,
        schedules,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `endo-scheduling-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Data exported as JSON", "success");
    } catch (e) {
      showToast("Export failed: " + e.message, "error");
    }
  };

  const triggerImport = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleImportFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed.staff || !parsed.rules || !parsed.schedules) {
          throw new Error("Invalid file format");
        }
        if (
          !confirm(
            `Import will replace all current staff, rules, and schedules in the cloud. Continue?`
          )
        ) {
          event.target.value = "";
          return;
        }

        // Push to cloud immediately so all signed-in users see it
        setSyncStatus("saving");
        markLocalEdit();

        await saveAllStaff(parsed.staff);
        await saveAllRules(parsed.rules);
        for (const [week, byLoc] of Object.entries(parsed.schedules)) {
          for (const [loc, data] of Object.entries(byLoc)) {
            await saveOneSchedule(week, loc, data);
          }
        }

        setStaff(parsed.staff);
        setRules(parsed.rules);
        setSchedules(parsed.schedules);
        setSyncStatus("saved");
        setTimeout(() => setSyncStatus("idle"), 1500);
        showToast("Data imported and synced to cloud", "success");
      } catch (err) {
        setSyncStatus("error");
        showToast("Import failed: " + err.message, "error");
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  };

  const exportToExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const monday = parseLocalDate(currentWeek);
      LOCATIONS.forEach((loc) => {
        const sched = schedules[currentWeek]?.[loc] || emptyLocationSchedule(loc);
        const config = LOCATION_CONFIGS[loc];
        const locCode = LOC_META[loc].code;
        const header = `${locCode} - ${loc} Weekly Schedule`;
        const dayDates = getDayDates(monday);

        const aoa = [];
        aoa.push(["", header, "", "", "", ""]);
        aoa.push(["", "", "", "", "", ""]);
        aoa.push(["", ...dayDates.map((d) => formatDateShort(d))]);
        aoa.push(["", ...DAYS]);

        config.sections.forEach((section) => {
          aoa.push(["", section.label, "", "", "", ""]);
          section.slots.forEach((slot) => {
            const assignments = sched.sections?.[section.id]?.[slot.id] || ["", "", "", "", ""];
            if (slot.roomHeader) {
              aoa.push(["", slot.label, "", "", "", ""]);
              aoa.push(["", ...assignments]);
            } else {
              aoa.push([slot.label || "", ...assignments]);
            }
          });
        });

        aoa.push(["", "Training / Time Off / Etc.", "", "", "", ""]);
        aoa.push(["", ...sched.notes.map((n) => n || "")]);

        aoa.push(["", "Doctors Scheduled", "", "", "", ""]);
        for (let i = 1; i <= config.rooms; i++) {
          aoa.push([
            `Rm ${i}`,
            ...(sched.doctors?.[`rm${i}`] || ["", "", "", "", ""]),
          ]);
        }

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws["!cols"] = [
          { wch: 10 },
          { wch: 20 },
          { wch: 20 },
          { wch: 20 },
          { wch: 20 },
          { wch: 20 },
        ];
        const sheetName = `${formatDateShort(monday).replace(/\//g, ".")} ${loc}`.slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      const fileName = `Endo_Schedule_${currentWeek}.xlsx`;
      XLSX.writeFile(wb, fileName);
      showToast(`Exported ${fileName}`, "success");
    } catch (e) {
      showToast("Export failed: " + e.message, "error");
    }
  };

  /* ---- Week navigation ---- */
  const shiftWeek = (n) => {
    const d = parseLocalDate(currentWeek);
    d.setDate(d.getDate() + n * 7);
    setCurrentWeek(weekKey(d));
  };

  const mondayObj = parseLocalDate(currentWeek);
  const dayDates = getDayDates(mondayObj);

  /* ============================================================
     Render gates: config error → auth check → loading → app
  ============================================================ */
  if (!supabaseConfigured) {
    return (
      <div className="ga-bg min-h-screen flex items-center justify-center px-6">
        <div className="ga-card border ga-border rounded-lg p-8 max-w-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle size={24} className="text-amber-300 flex-shrink-0 mt-1" />
            <div>
              <h2 className="font-display text-xl font-semibold text-ga mb-2">
                Cloud sync not configured
              </h2>
              <p className="text-sm text-ga-dim leading-relaxed mb-4">
                The dashboard couldn't find the Supabase environment variables it needs to
                connect to the cloud database.
              </p>
              <p className="text-sm text-ga-dim leading-relaxed mb-2">
                The deploy needs these two environment variables set in Netlify:
              </p>
              <ul className="text-xs font-mono-custom text-ga-accent space-y-1 mb-4 list-disc list-inside">
                <li>VITE_SUPABASE_URL</li>
                <li>VITE_SUPABASE_ANON_KEY</li>
              </ul>
              <p className="text-xs text-ga-muted">
                See SUPABASE_SETUP.md in the project for full instructions.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className="ga-bg min-h-screen flex items-center justify-center">
        <Loader2 size={28} className="text-ga-accent animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <SignIn onSuccess={() => { /* auth state listener will update session */ }} />;
  }

  if (!loaded) {
    return (
      <div className="ga-bg min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="text-ga-accent animate-spin" />
          <p className="text-xs text-ga-dim font-mono-custom uppercase tracking-[0.15em]">
            {loadError ? "Connection failed" : "Loading schedules…"}
          </p>
          {loadError && (
            <p className="text-xs text-rose-300 max-w-md text-center mt-2">
              {loadError}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ga-bg min-h-screen font-body text-ga">
      {/* ============ Header ============ */}
      <header className="border-b ga-border bg-[#0F1A2E]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="logo-glow relative">
              <img
                src="/ga-logo.png"
                alt="Gastroenterology Associates"
                className="h-11 w-auto relative z-10"
                draggable="false"
              />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight leading-none text-ga">
                Gastroenterology Associates
              </h1>
              <p className="text-[11px] text-ga-accent mt-1 tracking-[0.15em] uppercase font-medium">
                Endoscopy Scheduling
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-1 ga-card-soft rounded-md p-1 border ga-border-soft">
            {[
              { id: "schedule", label: "Schedule", Icon: Calendar },
              { id: "staff", label: "Staff", Icon: Users },
              { id: "rules", label: "Rules", Icon: Settings },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded transition-colors ${
                  view === id
                    ? "bg-[#23314C] text-ga-accent shadow-inner"
                    : "text-ga-dim hover:text-ga"
                }`}
              >
                <Icon size={15} strokeWidth={1.8} />
                {label}
              </button>
            ))}
          </nav>

          {/* JSON data port + cloud status + sign-out */}
          <div className="flex items-center gap-2">
            <SyncIndicator status={syncStatus} />

            <button
              onClick={triggerImport}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-ga-dim hover:text-ga-accent rounded-md hover:bg-[#1C2A43] transition-colors"
              title="Import all data from a JSON backup"
            >
              <Upload size={13} strokeWidth={1.8} /> Import
            </button>
            <button
              onClick={exportAllData}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-ga-dim hover:text-ga-accent rounded-md hover:bg-[#1C2A43] transition-colors"
              title="Export all data as a shareable JSON file"
            >
              <FileJson size={13} strokeWidth={1.8} /> Backup
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              className="hidden"
            />

            <div className="w-px h-6 bg-[#23314C] mx-1" />

            <button
              onClick={async () => {
                try {
                  await supabaseSignOut();
                  setSession(null);
                  setLoaded(false);
                } catch (e) {
                  showToast("Sign-out failed: " + e.message, "error");
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-ga-dim hover:text-rose-300 rounded-md hover:bg-rose-950/30 transition-colors"
              title={session?.user?.email ? `Signed in as ${session.user.email}` : "Sign out"}
            >
              <LogOut size={13} strokeWidth={1.8} /> Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ============ Toast ============ */}
      {toast && (
        <div
          className={`fixed top-24 right-6 z-50 px-4 py-3 rounded-md shadow-2xl flex items-center gap-2 text-sm border backdrop-blur-md ${
            toast.kind === "success"
              ? "bg-emerald-950/90 border-emerald-700/50 text-emerald-200"
              : toast.kind === "warn"
                ? "bg-amber-950/90 border-amber-700/50 text-amber-200"
                : toast.kind === "error"
                  ? "bg-rose-950/90 border-rose-700/50 text-rose-200"
                  : "bg-[#162238] border-[#23314C] text-ga"
          }`}
        >
          {toast.kind === "success" && <CheckCircle2 size={16} />}
          {toast.kind === "warn" && <AlertTriangle size={16} />}
          {toast.kind === "error" && <X size={16} />}
          {toast.kind === "info" && <Info size={16} />}
          {toast.msg}
        </div>
      )}

      {/* ============ Main ============ */}
      <main className="max-w-[1400px] mx-auto px-6 py-6">
        {view === "schedule" && (
          <ScheduleView
            currentLocation={currentLocation}
            setCurrentLocation={setCurrentLocation}
            currentWeek={currentWeek}
            setCurrentWeek={setCurrentWeek}
            dayDates={dayDates}
            shiftWeek={shiftWeek}
            schedule={currentSchedule}
            updateSchedule={updateSchedule}
            staff={staff}
            validation={validation}
            onCopyPrevious={copyPreviousWeek}
            onAutoFill={autoFillRotations}
            onClearWeek={clearWeek}
            onExport={exportToExcel}
          />
        )}
        {view === "staff" && (
          <StaffView staff={staff} setStaff={setStaff} />
        )}
        {view === "rules" && (
          <RulesView rules={rules} setRules={setRules} staff={staff} />
        )}
      </main>

      <footer className="max-w-[1400px] mx-auto px-6 py-6 text-xs text-ga-muted font-mono-custom flex items-center gap-2">
        <Cloud size={12} />
        <span>Synced to cloud · Signed in as {session?.user?.email}</span>
      </footer>
    </div>
  );
}

/* ============================================================
   SyncIndicator: shows current cloud-sync state in the header
============================================================ */
function SyncIndicator({ status }) {
  let icon, label, color;
  switch (status) {
    case "saving":
      icon = <Loader2 size={12} className="animate-spin" />;
      label = "Saving";
      color = "text-ga-accent";
      break;
    case "saved":
      icon = <CheckCircle2 size={12} />;
      label = "Saved";
      color = "text-emerald-300";
      break;
    case "remote":
      icon = <Cloud size={12} />;
      label = "Updated";
      color = "text-sky-300";
      break;
    case "error":
      icon = <CloudOff size={12} />;
      label = "Sync failed";
      color = "text-rose-300";
      break;
    case "idle":
    default:
      icon = <Cloud size={12} />;
      label = "Synced";
      color = "text-ga-muted";
  }
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 text-[10px] font-mono-custom uppercase tracking-wider ${color}`}
      title={`Cloud sync status: ${label}`}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

/* ============================================================
   Schedule View
============================================================ */
function ScheduleView({
  currentLocation,
  setCurrentLocation,
  currentWeek,
  dayDates,
  shiftWeek,
  schedule,
  updateSchedule,
  staff,
  validation,
  onCopyPrevious,
  onAutoFill,
  onClearWeek,
  onExport,
}) {
  const config = LOCATION_CONFIGS[currentLocation];

  // Filter staff for dropdown options based on slot's role + location eligibility
  const getOptions = (section, slot) => {
    let allowedRole;
    if (section.role === "RN_OR_TECH") {
      if (slot.allowedRole === ROLES.RN) allowedRole = null; // allow any for seats (with warning)
      else allowedRole = null;
    } else {
      allowedRole = section.role;
    }
    let list = staff;
    if (allowedRole) {
      list = list.filter((s) => s.role === allowedRole);
    }
    list = list.filter((s) => s.eligible.includes(currentLocation));
    return list.slice().sort((a, b) => a.display.localeCompare(b.display));
  };

  const setCell = (sectionId, slotId, dayIdx, value) => {
    updateSchedule((sched) => {
      if (!sched.sections[sectionId]) sched.sections[sectionId] = {};
      if (!sched.sections[sectionId][slotId])
        sched.sections[sectionId][slotId] = ["", "", "", "", ""];
      sched.sections[sectionId][slotId][dayIdx] = value;
      return sched;
    });
  };

  const setNote = (dayIdx, value) => {
    updateSchedule((sched) => {
      sched.notes[dayIdx] = value;
      return sched;
    });
  };

  const setDoctor = (roomKey, dayIdx, value) => {
    updateSchedule((sched) => {
      if (!sched.doctors) sched.doctors = {};
      if (!sched.doctors[roomKey]) sched.doctors[roomKey] = ["", "", "", "", ""];
      sched.doctors[roomKey][dayIdx] = value;
      return sched;
    });
  };

  // Warnings specific to each cell
  const cellWarnings = useMemo(() => {
    const map = {};
    validation.forEach((w) => {
      if (!w.day) return;
      const dayIdx = DAYS.indexOf(w.day);
      if (dayIdx < 0) return;
      const key = `${w.name}-${dayIdx}`;
      map[key] = (map[key] || []).concat(w.message);
    });
    return map;
  }, [validation]);

  return (
    <div>
      {/* Location Tabs */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-end gap-0 border-b ga-border">
          {LOCATIONS.map((loc) => {
            const active = currentLocation === loc;
            return (
              <button
                key={loc}
                onClick={() => setCurrentLocation(loc)}
                className={`relative px-5 py-3 text-sm font-medium transition-colors ${
                  active
                    ? "text-ga tab-underline"
                    : "text-ga-dim hover:text-ga"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building2 size={14} strokeWidth={1.8} />
                  <span>{loc}</span>
                  <span className="font-mono text-[10px] text-ga-muted">
                    {LOC_META[loc].code}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Week picker */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftWeek(-1)}
            className="p-2 rounded-md hover:bg-[#1C2A43] hover:text-ga-accent text-ga-dim transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="px-4 py-2 bg-[#162238] border ga-border rounded-md min-w-[200px] text-center">
            <div className="font-display text-sm font-semibold text-ga">
              {formatWeekRange(parseLocalDate(currentWeek))}
            </div>
            <div className="text-[10px] font-mono-custom text-ga-accent tracking-[0.15em] uppercase mt-0.5">
              Week of {parseLocalDate(currentWeek).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
            </div>
          </div>
          <button
            onClick={() => shiftWeek(1)}
            className="p-2 rounded-md hover:bg-[#1C2A43] hover:text-ga-accent text-ga-dim transition-colors"
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <ActionButton icon={Copy} onClick={onCopyPrevious} label="Copy Previous Week" />
          <ActionButton
            icon={Zap}
            onClick={onAutoFill}
            label="Auto-fill Rotations"
            accent
          />
          <ActionButton icon={Trash2} onClick={onClearWeek} label="Clear Week" danger />
        </div>
        <ActionButton icon={Download} onClick={onExport} label="Export to Excel" solid />
      </div>

      {/* Validation Panel */}
      {validation.length > 0 && (
        <div className="mb-4 p-4 bg-amber-950/30 border border-amber-700/50 rounded-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-300 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-amber-200 mb-1">
                {validation.length} warning{validation.length !== 1 ? "s" : ""}
                <span className="font-normal text-amber-300 ml-2">
                  (rotations are guidelines — overrides are OK)
                </span>
              </div>
              <ul className="text-xs text-amber-100 space-y-0.5 max-h-32 overflow-auto">
                {validation.slice(0, 10).map((w, i) => (
                  <li key={i}>• {w.message}</li>
                ))}
                {validation.length > 10 && (
                  <li className="italic">… and {validation.length - 10} more</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Grid */}
      <div className="ga-card border ga-border rounded-sm overflow-hidden">
        {/* Day Header */}
        <div className="grid grid-cols-[140px_repeat(5,1fr)] border-b ga-border bg-[#1C2A43]/40">
          <div className="px-3 py-3 text-[11px] font-mono text-ga-muted tracking-wider uppercase">
            Section / Slot
          </div>
          {DAYS.map((d, i) => (
            <div
              key={d}
              className="px-3 py-3 border-l ga-border"
            >
              <div className="font-display text-sm font-semibold text-ga">{d}</div>
              <div className="text-[10px] font-mono text-ga-muted tracking-wide">
                {formatDateShort(dayDates[i])}
              </div>
            </div>
          ))}
        </div>

        {/* Sections */}
        {config.sections.map((section) => (
          <div key={section.id}>
            {/* Section header row */}
            <div className="grid grid-cols-[140px_repeat(5,1fr)] bg-gradient-to-r from-[#162238] via-[#1C2A43] to-[#162238] border-y ga-border">
              <div className="px-4 py-2.5 section-header section-bar text-sm font-semibold uppercase tracking-[0.1em] col-span-6 flex items-center justify-between text-ga">
                <span>{section.label}</span>
                <div className="flex items-center gap-2 text-[10px] font-mono-custom tracking-wide text-ga-muted normal-case">
                  {section.rotating && <span className="text-ga-accent">rotating</span>}
                  <span>· {section.role === "RN_OR_TECH" ? "RN / Tech" : section.role}</span>
                </div>
              </div>
            </div>

            {/* Slots */}
            {section.slots.map((slot) => {
              const assignments = schedule.sections?.[section.id]?.[slot.id] || [
                "", "", "", "", "",
              ];

              if (slot.roomHeader) {
                return (
                  <React.Fragment key={slot.id}>
                    <div className="grid grid-cols-[140px_repeat(5,1fr)] bg-[#1C2A43]/50 border-t ga-border">
                      <div className="px-3 py-1.5 text-xs font-medium text-ga-dim italic col-span-6">
                        {slot.label}
                      </div>
                    </div>
                    <div className="grid grid-cols-[140px_repeat(5,1fr)] border-t ga-border-soft">
                      <div className="px-3 py-2 text-xs text-ga-muted font-mono"></div>
                      {DAY_KEYS.map((_, dayIdx) => (
                        <Cell
                          key={dayIdx}
                          value={assignments[dayIdx]}
                          options={getOptions(section, slot)}
                          onChange={(v) => setCell(section.id, slot.id, dayIdx, v)}
                          warnings={cellWarnings[`${assignments[dayIdx]}-${dayIdx}`]}
                        />
                      ))}
                    </div>
                  </React.Fragment>
                );
              }

              return (
                <div
                  key={slot.id}
                  className="grid grid-cols-[140px_repeat(5,1fr)] border-t ga-border-soft"
                >
                  <div className="px-3 py-2 text-xs text-ga-dim font-mono bg-[#1A2538]/40 flex items-center">
                    {slot.label || "\u00A0"}
                  </div>
                  {DAY_KEYS.map((_, dayIdx) => (
                    <Cell
                      key={dayIdx}
                      value={assignments[dayIdx]}
                      options={getOptions(section, slot)}
                      onChange={(v) => setCell(section.id, slot.id, dayIdx, v)}
                      warnings={cellWarnings[`${assignments[dayIdx]}-${dayIdx}`]}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ))}

        {/* Training / Time Off */}
        <div className="grid grid-cols-[140px_repeat(5,1fr)] bg-gradient-to-r from-[#162238] via-[#1C2A43] to-[#162238] border-y ga-border">
          <div className="px-4 py-2.5 section-header section-bar text-sm font-semibold uppercase tracking-[0.1em] col-span-6 text-ga">
            Training / Time Off / Etc.
          </div>
        </div>
        <div className="grid grid-cols-[140px_repeat(5,1fr)] border-t ga-border-soft">
          <div className="px-3 py-2 text-xs text-ga-dim font-mono bg-[#1A2538]/40">
            Notes
          </div>
          {DAY_KEYS.map((_, dayIdx) => (
            <div
              key={dayIdx}
              className="border-l ga-border-soft min-h-[90px] p-1"
            >
              <textarea
                className="cell-input"
                style={{ minHeight: "82px" }}
                value={schedule.notes?.[dayIdx] || ""}
                onChange={(e) => setNote(dayIdx, e.target.value)}
                placeholder="—"
              />
            </div>
          ))}
        </div>

        {/* Doctors Scheduled */}
        <div className="grid grid-cols-[140px_repeat(5,1fr)] bg-gradient-to-r from-[#162238] via-[#1C2A43] to-[#162238] border-y ga-border">
          <div className="px-4 py-2.5 section-header section-bar text-sm font-semibold uppercase tracking-[0.1em] col-span-6 text-ga">
            Doctors Scheduled
          </div>
        </div>
        {Array.from({ length: config.rooms }, (_, i) => {
          const roomKey = `rm${i + 1}`;
          const assignments = schedule.doctors?.[roomKey] || ["", "", "", "", ""];
          return (
            <div
              key={roomKey}
              className="grid grid-cols-[140px_repeat(5,1fr)] border-t ga-border-soft"
            >
              <div className="px-3 py-2 text-xs text-ga-dim font-mono bg-[#1A2538]/40 flex items-center">
                Rm {i + 1}
              </div>
              {DAY_KEYS.map((_, dayIdx) => (
                <div key={dayIdx} className="border-l ga-border-soft assignment-cell cell-hover">
                  <input
                    className="cell-input"
                    style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, textTransform: "uppercase" }}
                    value={assignments[dayIdx]}
                    onChange={(e) => setDoctor(roomKey, dayIdx, e.target.value)}
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Summary bar */}
      <div className="mt-4 flex items-center gap-6 text-xs text-ga-dim font-mono">
        <span>{config.rooms} procedure room{config.rooms !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>{staff.filter((s) => s.eligible.includes(currentLocation)).length} eligible staff</span>
        <span>·</span>
        <span>Auto-saved</span>
      </div>
    </div>
  );
}

function Cell({ value, options, onChange, warnings }) {
  const hasWarn = warnings && warnings.length > 0;
  return (
    <div
      className={`border-l ga-border-soft assignment-cell cell-hover relative ${
        !value ? "empty" : ""
      } ${hasWarn ? "warn-pulse" : ""}`}
      title={hasWarn ? warnings.join("\n") : undefined}
    >
      <select
        className="cell-select"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {value && !options.find((o) => o.display === value) && (
          <option value={value}>{value} (off-list)</option>
        )}
        {options.map((o) => (
          <option key={o.id} value={o.display}>
            {o.display}
          </option>
        ))}
      </select>
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick, solid, accent, danger }) {
  const base = "flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-md transition-all";
  let cls = "";
  if (solid) {
    // Primary action (Export): bright accent with subtle glow
    cls = "bg-ga-accent text-[#0B1220] hover:bg-[#0EA5E9] font-semibold shadow-[0_0_20px_rgba(56,189,248,0.25)] hover:shadow-[0_0_28px_rgba(56,189,248,0.45)]";
  } else if (accent) {
    // Auto-fill: slightly different emphasis using brand blue
    cls = "bg-[#2970B8] text-white hover:bg-[#3B82C9] shadow-[0_0_16px_rgba(41,112,184,0.25)]";
  } else if (danger) {
    cls = "text-rose-300 hover:bg-rose-950/40 border border-transparent hover:border-rose-800/50";
  } else {
    cls = "bg-[#162238] text-ga hover:bg-[#1C2A43] border ga-border hover:border-[#2A3A58]";
  }
  return (
    <button onClick={onClick} className={`${base} ${cls}`}>
      <Icon size={14} strokeWidth={2} />
      {label}
    </button>
  );
}

/* ============================================================
   Staff View
============================================================ */
function StaffView({ staff, setStaff }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);

  const filtered = useMemo(() => {
    return staff
      .filter((s) => (filter === "all" ? true : s.role === filter))
      .filter((s) => {
        const q = search.toLowerCase();
        if (!q) return true;
        return (
          s.display.toLowerCase().includes(q) ||
          s.fullName.toLowerCase().includes(q) ||
          s.primary.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.display.localeCompare(b.display));
  }, [staff, filter, search]);

  const addStaff = () => {
    const id = `new_${Date.now()}`;
    const newStaff = {
      id,
      display: "New Staff",
      fullName: "New, Staff",
      role: ROLES.TECH,
      primary: "Halton",
      eligible: ["Halton"],
      notes: "",
    };
    setStaff((prev) => [...prev, newStaff]);
    setEditing(id);
  };

  const updateStaff = (id, patch) => {
    setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const deleteStaff = (id) => {
    if (!confirm("Delete this staff member?")) return;
    setStaff((prev) => prev.filter((s) => s.id !== id));
  };

  const counts = useMemo(() => {
    const c = { all: staff.length, Tech: 0, RN: 0, FD: 0 };
    staff.forEach((s) => (c[s.role] = (c[s.role] || 0) + 1));
    return c;
  }, [staff]);

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Staff Roster</h2>
          <p className="text-sm text-ga-dim mt-0.5">
            {staff.length} team members · configure primary and eligible locations
          </p>
        </div>
        <button
          onClick={addStaff}
          className="flex items-center gap-2 px-4 py-2 bg-ga-accent text-[#0B1220] text-sm font-semibold rounded-md hover:bg-[#0EA5E9] shadow-[0_0_20px_rgba(56,189,248,0.25)] transition-all"
        >
          <Plus size={14} strokeWidth={2.4} /> Add Staff
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center ga-card border ga-border rounded-sm p-1">
          {[
            { id: "all", label: "All" },
            { id: ROLES.TECH, label: "Techs" },
            { id: ROLES.RN, label: "RNs" },
            { id: ROLES.FD, label: "Front Desk" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm ${
                filter === f.id ? "bg-[#1C2A43] text-ga" : "text-ga-dim hover:text-ga"
              }`}
            >
              {f.label}
              <span className="ml-1.5 text-ga-muted font-mono">{counts[f.id] || 0}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ga-card border ga-border rounded-sm px-3 py-1.5 flex-1 max-w-sm">
          <Search size={14} className="text-ga-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff..."
            className="outline-none text-sm flex-1"
          />
        </div>
      </div>

      {/* Table */}
      <div className="ga-card border ga-border rounded-sm overflow-hidden">
        <div className="grid grid-cols-[1.3fr_1.5fr_90px_1fr_2fr_auto] bg-[#1C2A43]/40 border-b ga-border text-[11px] font-mono text-ga-dim uppercase tracking-wider">
          <div className="px-3 py-2">Display Name</div>
          <div className="px-3 py-2">Full Name</div>
          <div className="px-3 py-2">Role</div>
          <div className="px-3 py-2">Primary</div>
          <div className="px-3 py-2">Eligible Locations</div>
          <div className="px-3 py-2 w-16"></div>
        </div>
        {filtered.map((s) => (
          <StaffRow
            key={s.id}
            staff={s}
            editing={editing === s.id}
            setEditing={setEditing}
            onUpdate={(patch) => updateStaff(s.id, patch)}
            onDelete={() => deleteStaff(s.id)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-ga-muted">
            No staff match this filter
          </div>
        )}
      </div>
    </div>
  );
}

function StaffRow({ staff: s, editing, setEditing, onUpdate, onDelete }) {
  const toggleEligible = (loc) => {
    const next = s.eligible.includes(loc)
      ? s.eligible.filter((l) => l !== loc)
      : [...s.eligible, loc];
    onUpdate({ eligible: next });
  };

  return (
    <div className="grid grid-cols-[1.3fr_1.5fr_90px_1fr_2fr_auto] border-t ga-border-soft hover:bg-[#1A2538]/40 text-sm items-center">
      <div className="px-3 py-2">
        {editing ? (
          <input
            className="cell-input border ga-border rounded-sm"
            value={s.display}
            onChange={(e) => onUpdate({ display: e.target.value })}
          />
        ) : (
          <span className="font-medium">{s.display}</span>
        )}
      </div>
      <div className="px-3 py-2 text-ga-dim">
        {editing ? (
          <input
            className="cell-input border ga-border rounded-sm"
            value={s.fullName}
            onChange={(e) => onUpdate({ fullName: e.target.value })}
          />
        ) : (
          s.fullName
        )}
      </div>
      <div className="px-3 py-2">
        <select
          value={s.role}
          onChange={(e) => onUpdate({ role: e.target.value })}
          className="text-xs font-mono-custom bg-[#1C2A43] text-ga-accent px-2 py-1 rounded border-none outline-none cursor-pointer"
        >
          <option value={ROLES.TECH}>Tech</option>
          <option value={ROLES.RN}>RN</option>
          <option value={ROLES.FD}>FD</option>
        </select>
      </div>
      <div className="px-3 py-2">
        <select
          value={s.primary}
          onChange={(e) => {
            const newPrimary = e.target.value;
            const newEligible = s.eligible.includes(newPrimary)
              ? s.eligible
              : [...s.eligible, newPrimary];
            onUpdate({ primary: newPrimary, eligible: newEligible });
          }}
          className="text-xs bg-transparent outline-none"
        >
          {LOCATIONS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </div>
      <div className="px-3 py-2 flex flex-wrap gap-1">
        {LOCATIONS.map((l) => {
          const on = s.eligible.includes(l);
          return (
            <button
              key={l}
              onClick={() => toggleEligible(l)}
              className={`px-2 py-0.5 text-[11px] font-semibold rounded border transition-colors ${
                on
                  ? "bg-ga-accent text-[#0B1220] border-ga-accent"
                  : "bg-[#162238] text-ga-dim ga-border hover:border-ga-accent hover:text-ga"
              }`}
              title={on ? `Eligible at ${l}` : `Not eligible at ${l}`}
            >
              {l.slice(0, 4)}
            </button>
          );
        })}
      </div>
      <div className="px-3 py-2 flex items-center gap-1">
        <button
          onClick={() => setEditing(editing ? null : s.id)}
          className="p-1.5 text-xs text-ga-dim hover:text-ga"
        >
          {editing ? <CheckCircle2 size={14} /> : <Settings size={14} />}
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-xs text-rose-400 hover:text-rose-300"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Rules View
============================================================ */
function RulesView({ rules, setRules, staff }) {
  const [loc, setLoc] = useState("Halton");
  const config = LOCATION_CONFIGS[loc];
  const staffById = Object.fromEntries(staff.map((s) => [s.id, s]));

  const updateRoomOwner = (roomKey, staffId) => {
    setRules((prev) => ({
      ...prev,
      roomOwners: {
        ...prev.roomOwners,
        [loc]: { ...prev.roomOwners[loc], [roomKey]: staffId },
      },
    }));
  };

  const updateRotationOrder = (sectionKey, newOrder) => {
    setRules((prev) => ({
      ...prev,
      rotationOrders: {
        ...prev.rotationOrders,
        [loc]: { ...prev.rotationOrders[loc], [sectionKey]: newOrder },
      },
    }));
  };

  const moveInOrder = (sectionKey, idx, dir) => {
    const current = [...(rules.rotationOrders[loc]?.[sectionKey] || [])];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= current.length) return;
    [current[idx], current[newIdx]] = [current[newIdx], current[idx]];
    updateRotationOrder(sectionKey, current);
  };

  const removeFromOrder = (sectionKey, idx) => {
    const current = [...(rules.rotationOrders[loc]?.[sectionKey] || [])];
    current.splice(idx, 1);
    updateRotationOrder(sectionKey, current);
  };

  const addToOrder = (sectionKey, staffId) => {
    if (!staffId) return;
    const current = [...(rules.rotationOrders[loc]?.[sectionKey] || [])];
    if (current.includes(staffId)) return;
    current.push(staffId);
    updateRotationOrder(sectionKey, current);
  };

  const techsForLoc = staff.filter((s) => s.role === ROLES.TECH && s.eligible.includes(loc));
  const rnsForLoc = staff.filter((s) => s.role === ROLES.RN && s.eligible.includes(loc));
  const fdForLoc = staff.filter((s) => s.role === ROLES.FD && s.eligible.includes(loc));

  return (
    <div>
      <div className="mb-5">
        <h2 className="font-display text-2xl font-semibold tracking-tight">Scheduling Rules</h2>
        <p className="text-sm text-ga-dim mt-0.5">
          Room owners and rotation orders — applied when you click "Auto-fill Rotations"
        </p>
      </div>

      <div className="flex items-center gap-2 mb-5">
        {LOCATIONS.map((l) => (
          <button
            key={l}
            onClick={() => setLoc(l)}
            className={`px-4 py-2 text-sm font-medium rounded-md border transition-all ${
              loc === l
                ? "bg-ga-accent text-[#0B1220] border-ga-accent font-semibold shadow-[0_0_16px_rgba(56,189,248,0.3)]"
                : "bg-[#162238] text-ga-dim ga-border hover:border-ga-accent hover:text-ga"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Room Owners */}
        <div className="ga-card border ga-border rounded-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={16} className="text-ga-accent" />
            <h3 className="font-display text-lg font-semibold">Room Owners</h3>
          </div>
          <p className="text-xs text-ga-dim mb-4">
            Default RN or Tech for each procedure room — used as a hint when building the week
          </p>
          <div className="space-y-2">
            {Array.from({ length: config.rooms }, (_, i) => {
              const key = `rm${i + 1}`;
              const ownerId = rules.roomOwners[loc]?.[key] || "";
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-24 text-xs font-mono text-ga-dim">Room {i + 1}</span>
                  <select
                    value={ownerId}
                    onChange={(e) => updateRoomOwner(key, e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm bg-[#1C2A43]/60 border ga-border rounded-sm outline-none"
                  >
                    <option value="">— No default —</option>
                    {[...rnsForLoc, ...techsForLoc]
                      .sort((a, b) => a.display.localeCompare(b.display))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.display} ({s.role})
                        </option>
                      ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rotation Orders */}
        <div className="space-y-5">
          <RotationEditor
            label="Front Office Rotation"
            sectionKey="frontOffice"
            order={rules.rotationOrders[loc]?.frontOffice || []}
            candidates={fdForLoc}
            staffById={staffById}
            onMove={moveInOrder}
            onRemove={removeFromOrder}
            onAdd={addToOrder}
          />
          <RotationEditor
            label="Float Rotation"
            sectionKey="float"
            order={rules.rotationOrders[loc]?.float || []}
            candidates={techsForLoc}
            staffById={staffById}
            onMove={moveInOrder}
            onRemove={removeFromOrder}
            onAdd={addToOrder}
          />
          <RotationEditor
            label="Recovery Rotation"
            sectionKey="recovery"
            order={rules.rotationOrders[loc]?.recovery || []}
            candidates={rnsForLoc}
            staffById={staffById}
            onMove={moveInOrder}
            onRemove={removeFromOrder}
            onAdd={addToOrder}
          />
        </div>
      </div>
    </div>
  );
}

function RotationEditor({ label, sectionKey, order, candidates, staffById, onMove, onRemove, onAdd }) {
  const [addChoice, setAddChoice] = useState("");
  const available = candidates.filter((c) => !order.includes(c.id));

  return (
    <div className="ga-card border ga-border rounded-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={16} className="text-ga-accent" />
        <h3 className="font-display text-lg font-semibold">{label}</h3>
      </div>
      <p className="text-xs text-ga-dim mb-3">
        Monday's starting order. Each day advances: the last person rotates to the first slot.
      </p>

      <ol className="space-y-1 mb-3">
        {order.map((id, idx) => {
          const s = staffById[id];
          return (
            <li
              key={id}
              className="flex items-center gap-2 bg-[#1C2A43]/60 border ga-border rounded-sm px-2 py-1.5"
            >
              <span className="w-5 text-xs font-mono text-ga-muted">{idx + 1}</span>
              <span className="flex-1 text-sm font-medium">
                {s ? s.display : <em className="text-rose-400">Unknown ({id})</em>}
              </span>
              <button
                onClick={() => onMove(sectionKey, idx, -1)}
                disabled={idx === 0}
                className="p-1 text-ga-dim hover:text-ga disabled:text-ga-muted"
              >
                <MoveUp size={12} />
              </button>
              <button
                onClick={() => onMove(sectionKey, idx, 1)}
                disabled={idx === order.length - 1}
                className="p-1 text-ga-dim hover:text-ga disabled:text-ga-muted"
              >
                <MoveDown size={12} />
              </button>
              <button
                onClick={() => onRemove(sectionKey, idx)}
                className="p-1 text-rose-400 hover:text-rose-300"
              >
                <X size={12} />
              </button>
            </li>
          );
        })}
        {order.length === 0 && (
          <li className="text-xs text-ga-muted italic py-2">No one in rotation yet</li>
        )}
      </ol>

      {available.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={addChoice}
            onChange={(e) => setAddChoice(e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs ga-card border ga-border rounded-sm outline-none"
          >
            <option value="">+ Add staff to rotation...</option>
            {available
              .sort((a, b) => a.display.localeCompare(b.display))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display}
                </option>
              ))}
          </select>
          <button
            onClick={() => {
              onAdd(sectionKey, addChoice);
              setAddChoice("");
            }}
            disabled={!addChoice}
            className="px-3 py-1.5 text-xs bg-ga-accent text-[#0B1220] font-semibold rounded-md hover:bg-[#0EA5E9] disabled:bg-[#23314C] disabled:text-ga-muted transition-colors"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
