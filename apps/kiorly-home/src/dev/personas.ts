/**
 * DEV ONLY synthetic personas (TEST_DATA.md and each product's DEMO_DATA.md; the same lists as the product login pages' own "Test users"
 * panels). Imported only by ./TestUsers.tsx, which App.tsx loads behind `import.meta.env.DEV`, so none of this reaches a production bundle
 * (asserted by scripts/check-no-dev-test-users.mjs). Passwords are the documented dev values.
 */
import type { CardKey } from '../core';

export interface PassportPersona { phone: string; name: string; tile: CardKey; what: string }
export const PASSPORT_PERSONAS: PassportPersona[] = [
  { phone: '+201000002001', name: 'Ahmed Fawzy', tile: 'clinic', what: 'Clinic owner' },
  { phone: '+201000002004', name: 'Mostafa Reda', tile: 'pharmacy', what: 'Pharmacist' },
  { phone: '+201000002005', name: 'دينا وجدي', tile: 'lab', what: 'Lab technician' },
  { phone: '+201000003001', name: 'Mona Adel', tile: 'nurse', what: 'Solo nurse + agency (Nurse)' },
  { phone: '+201000002031', name: 'Demo Multi-Workspace Owner', tile: 'clinic', what: 'Clinic + Pharmacy + Lab' },
  { phone: '+201000002032', name: 'Demo No-Workspace Newcomer', tile: 'clinic', what: 'No organisation' },
];

export interface PasswordPersona { email: string; password: string; org: string; name: string; role: string; group: string }
const DEMO = 'Demo@12345';
const p = (email: string, name: string, role: string, group: string, password = DEMO, org = ''): PasswordPersona => ({ email, password, org, name, role, group });

const D = '@demo.kiorex.test'; const N = '@nurse-demo.kiorly.test';
const CLINIC: PasswordPersona[] = [
  p(`owner.na${D}`, 'Ahmed Fawzy', 'Owner / group admin', 'Nile Care Medical Center (PRO)'), p(`manager.na${D}`, 'Branch manager', 'Branch manager', 'Nile Care Medical Center (PRO)'),
  p(`frontdesk1.na${D}`, 'Front desk 1', 'Receptionist', 'Nile Care Medical Center (PRO)'), p(`nurse.na${D}`, 'Nurse', 'Nurse', 'Nile Care Medical Center (PRO)'),
  p(`accountant.na${D}`, 'Accountant', 'Finance officer', 'Nile Care Medical Center (PRO)'), p(`callcenter.na${D}`, 'Call centre', 'Call centre', 'Nile Care Medical Center (PRO)'),
  p(`nadia.na${D}`, 'Dr Nadia Fouad', 'Doctor (paediatrics)', 'Nile Care Medical Center (PRO)'), p(`walid.na${D}`, 'Dr Walid', 'Doctor (dermatology)', 'Nile Care Medical Center (PRO)'),
  p(`tamer.na${D}`, 'Dr Tamer', 'Doctor (cardiology)', 'Nile Care Medical Center (PRO)'), p(`mai.na${D}`, 'Dr Mai Hassan', 'Physiotherapist', 'Nile Care Medical Center (PRO)'),
  p(`owner.df${D}`, 'Delta owner', 'Owner / group admin', 'Delta Family Clinics (PRO)'), p(`ola.df${D}`, 'Dr Ola', 'Doctor (paediatrics)', 'Delta Family Clinics (PRO)'), p(`samah.df${D}`, 'Dr Samah', 'Doctor (licence expired)', 'Delta Family Clinics (PRO)'),
  p(`owner.ss${D}`, 'Smile & Skin owner', 'Owner', 'Smile & Skin Studio (Lite trial)'), p(`lamia.ss${D}`, 'Dr Lamia', 'Doctor (dermatology)', 'Smile & Skin Studio (Lite trial)'),
  p(`owner.basic${D}`, 'Ramy Hafez', 'Owner (Basic plan)', 'Corner Family Clinic (Basic)'), p(`doctor.basic${D}`, 'Dr Heba Lotfy', 'Doctor (Basic plan)', 'Corner Family Clinic (Basic)'), p(`nurse.basic${D}`, 'Mervat Adel', 'Nurse (Basic plan)', 'Corner Family Clinic (Basic)'),
  p('admin@kiorly.com', 'Group admin', 'Kiorly Clinic Group (Enterprise)', 'Older demo accounts (password demo)', 'demo'), p('superadmin@kiorly.com', 'Platform super admin', 'Platform tab', 'Older demo accounts (password demo)', 'demo'),
  p('admin@drahmedshall.com', 'Dr Ahmed Shall Group admin', '42 users', 'Older demo accounts (password demo)', 'demo'),
];
const NURSE: PasswordPersona[] = [
  p(`mona${N}`, 'Mona Adel', 'Solo nurse', 'Nurse edition (solo + agency)'), p(`owner${N}`, 'Agency owner', 'Agency owner', 'Nurse edition (solo + agency)'),
  p(`dispatch${N}`, 'Dina Dispatcher', 'Dispatcher', 'Nurse edition (solo + agency)'), p(`nurse1${N}`, 'Heba Nurse', 'Agency nurse (verified)', 'Nurse edition (solo + agency)'), p(`aide${N}`, 'Aya Aide', 'Care aide', 'Nurse edition (solo + agency)'),
];
const PH = '@demo.kiorly.local';
const ph = (l: string, name: string, role: string, group: string) => p(`${l}${PH}`, name, role, group);
const PHARMACY: PasswordPersona[] = [
  ph('owner', 'Dr. Demo Owner', 'Owner (licensed pharmacist)', 'Kiorly Demo Pharmacy (chain, Enterprise)'), ph('pharmacist', 'Ph. Salma Demo', 'Pharmacist', 'Kiorly Demo Pharmacy (chain, Enterprise)'),
  ph('pharmacist2', 'Pharmacist 2', 'Pharmacist (witness)', 'Kiorly Demo Pharmacy (chain, Enterprise)'), ph('manager', 'Mona Manager', 'Branch manager', 'Kiorly Demo Pharmacy (chain, Enterprise)'),
  ph('cashier', 'Omar Cashier', 'Cashier', 'Kiorly Demo Pharmacy (chain, Enterprise)'), ph('assistant', 'Asma Assistant', 'Assistant', 'Kiorly Demo Pharmacy (chain, Enterprise)'), ph('chain', 'Chain Ops', 'Chain operations', 'Kiorly Demo Pharmacy (chain, Enterprise)'),
  ph('solo.owner', 'Dr. Solo Owner', 'Owner', 'Kiorly Solo Pharmacy (Pro)'), ph('solo.pharmacist', 'Solo Pharmacist', 'Pharmacist', 'Kiorly Solo Pharmacy (Pro)'), ph('solo.manager', 'Solo Manager', 'Branch manager', 'Kiorly Solo Pharmacy (Pro)'),
  ph('solo.cashier', 'Solo Cashier', 'Cashier', 'Kiorly Solo Pharmacy (Pro)'), ph('solo.assistant', 'Solo Assistant', 'Assistant', 'Kiorly Solo Pharmacy (Pro)'),
  ph('owner.basic', 'Dr. Basic Owner', 'Owner', 'Kiorly Corner Pharmacy (Lite)'), ph('pharmacist.basic', 'Basic Pharmacist', 'Pharmacist', 'Kiorly Corner Pharmacy (Lite)'), ph('cashier.basic', 'Basic Cashier', 'Cashier', 'Kiorly Corner Pharmacy (Lite)'),
];
const LAB_ORGS: Array<[string, string]> = [['demo-lab', 'Cairo Diagnostics Lab (PRO)'], ['chain-lab', 'Delta Diagnostics Group (Enterprise)'], ['basic-lab', 'Starter Lab (Lite)']];
const LAB_ROLES: Array<[string, string, string]> = [
  ['owner', 'Layla Owner', 'Owner'], ['director', 'Dr. Karim Director', 'Lab director'], ['signatory', 'Dr. Salma Signatory', 'Authorized signatory'], ['tech', 'Omar Technologist', 'Technologist'],
  ['phleb', 'Nour Phlebotomist', 'Phlebotomist'], ['reception', 'Mona Reception', 'Reception'], ['manager', 'Hassan Manager', 'Branch manager'], ['supervisor', 'Rania Supervisor', 'Supervisor'], ['finance', 'Fady Finance', 'Finance'],
];
const LAB: PasswordPersona[] = LAB_ORGS.flatMap(([slug, group]) => LAB_ROLES.map(([l, name, role]) => ({ email: `${l}@${slug}.test`, password: '', org: slug, name, role, group })));

export const PASSWORD_PERSONAS: Record<CardKey, PasswordPersona[]> = { clinic: CLINIC, nurse: NURSE, pharmacy: PHARMACY, lab: LAB };
