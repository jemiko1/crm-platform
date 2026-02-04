import 'dotenv/config';
import { PrismaClient, EmployeeStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

// Data extracted from the Excel image
const employeeData = [
  { name: 'რატი ჯოლბორდი', department: 'IT დეპარტამენტი', email: 'rati.jolbordi@asg.ge', phone: '+995 595 06 88 09' },
  { name: 'ვალერიის ჯგუფი #1', department: 'ტექნიკური დეპარტამენტი', email: 'techgroup1@asg.ge', phone: null },
  { name: 'მიშა ხოშებაევა', department: 'IT დეპარტამენტი', email: 'mishka.khoshebaevi@asg.ge', phone: '+995 593 11 46 22' },
  { name: 'ქეთი ხელაშვილი', department: 'საოპერაციო დეპარტამენტი', email: 'keti.khelashvili@asg.ge', phone: '+995 577 68 52 83' },
  { name: 'ბექა ცანავა', department: 'კომერციული დეპარტამენტი', email: 'beka.tsanava@asg.ge', phone: '+995 571 14 11 92' },
  { name: 'სოფო ჩიხლაძე', department: 'Operators Tbilisi', email: 'sofo.chikhladze@asg.ge', phone: '+995 579 00 99 06' },
  { name: 'მიხეილ შუბითიძე', department: 'ლოჯისტიკის დეპარტამენტი', email: 'mikheil.shubitidze@asg.ge', phone: '+995 599 32 31 72' },
  { name: 'ანა ღლონტი', department: 'Social Media', email: 'ana.ghlonti@asg.ge', phone: '+995 568 11 34 92' },
  { name: 'ანამარია ქუთათელაძე', department: 'Operators Tbilisi', email: 'anamaria.kutateladze@asg.ge', phone: '+995 598 99 05 75' },
  { name: 'მაკო ფოლადაშვილი', department: 'საოპერაციო დეპარტამენტი', email: 'mako.foladashvili@asg.ge', phone: '+995 551 47 47 42' },
  { name: 'მარიამ ტყებუჩავა', department: 'კომერციული დეპარტამენტი', email: 'mariam.tkebuchava@asg.ge', phone: '+995511257929' },
  { name: 'გიორგი სულამანიძე', department: 'Azer Qonshular Qrupu LLC', email: 'giorgi.sulamanidze@asg.ge', phone: null },
  { name: 'თეო სანიკიძე', department: 'ფინანსური განყოფილების სამსახური', email: 'tea.sanikidze@asg.ge', phone: '+995 557 00 07 14' },
  { name: 'სალომე საგანელიძე', department: 'კომერციული დეპარტამენტი', email: 'salome.saganelldze@asg.ge', phone: '+995 551 42 54 54' },
  { name: 'ბელა რესულიძე', department: 'Operators Batumi', email: 'bela.resulidze@asg.ge', phone: '+995 597 91 69 47' },
  { name: 'ნინი ოდიშარია', department: 'საოპერაციო დეპარტამენტი', email: 'nini.odisharia@asg.ge', phone: '+995 595 00 38 18' },
  { name: 'ნიკოლოზ ნაცვლიშვილი', department: 'Legal Department', email: 'nikoloz.natsvlishvili@asg.ge', phone: '+995 599 84 73 70' },
  { name: 'მარიამ ნაკაიძე', department: 'Operators Tbilisi', email: 'mariam.nakaidze@asg.ge', phone: '+995 599 19 09 38' },
  { name: 'ანანო მჭედლიშვილი', department: 'Operators Batumi', email: 'anano.mchedlishvili@asg.ge', phone: '+995 551 09 80 07' },
  { name: 'ზუკა მორგოშია', department: 'კომერციული დეპარტამენტი', email: 'zuka.morgoshia@asg.ge', phone: '+995 591 09 31 90' },
  { name: 'ეკო მეფრიშვილი', department: 'საოპერაციო დეპარტამენტი', email: 'backoffice junior@asg.ge', phone: '+995 595 14 81 32' },
  { name: 'ირაკლი ჭარხალაშვილი მეტაფოქსის', department: 'IT Outsource', email: 'irakli.charkhalashvili@clphub.com', phone: null },
  { name: 'მზია მერმანიშვილი', department: 'Operators Tbilisi', email: 'mzia.mermanishvili@asg.ge', phone: '+995 577 03 70 71' },
  { name: 'გიგა მამრიკიშვილი', department: 'კომერციული დეპარტამენტი', email: 'giorgi.mamrikishvili@asg.ge', phone: '+995511251404' },
  { name: 'ირაკლი ლომია', department: 'ტექნიკური დეპარტამენტი', email: 'irakli.lomia@asg.ge', phone: '+995 571 93 63 36' },
  { name: 'ბენო კორკელია', department: 'ASG-Georgia', email: 'beno.korkelia@asg.ge', phone: null },
  { name: 'ქეთევან ქილაძე', department: 'Operators Tbilisi', email: 'ketevan.kiladze@asg.ge', phone: '+995 593 52 11 19' },
  { name: 'ნუკრი ირემაძე', department: 'ტექნიკური დეპარტამენტი', email: 'nukri.iremadze@asg.ge', phone: '+995 592 12 97 77' },
  { name: 'არასამუშაო დროის ზარები', department: 'Operators Tbilisi', email: 'nowork@asg.ge', phone: null },
  { name: 'ირაკლი ვეკუა', department: 'კომერციული დეპარტამენტი', email: 'irakli.vekua@asg.ge', phone: '+995 571 92 39 93' },
  { name: 'ჯეირან დურმუშოვა', department: 'Operators Tbilisi', email: 'jeiran.durmushova@asg.ge', phone: '+995 557 77 82 78' },
  { name: 'მარიამ დოლაბერიძე', department: 'Operators Batumi', email: 'mariam.dolaberidze@asg.ge', phone: '+995 555 41 24 75' },
  { name: 'ნათია გურგენაძე', department: 'Operators Batumi', email: 'natia.gurgenadze@asg.ge', phone: '+995 557 69 29 93' },
  { name: 'ხათუნა გუგუშვილი', department: 'ფინანსური განყოფილების სამსახური', email: 'khatuna.gugushvili@asg.ge', phone: '+995 568 35 71 17' },
  { name: 'გეგა გონგაძე', department: 'IT დეპარტამენტი', email: 'gega.gongadze@asg.ge', phone: '+995 571 08 74 68' },
  { name: 'გიორგი გოგიტიძე', department: 'კომერციული დეპარტამენტი', email: 'giorgi.gogitidze@asg.ge', phone: '+995 555 95 00 11' },
  { name: 'მურმან გივიშვილი', department: 'დასუფთავების სამსახური', email: 'murman.givishvili@asg.ge', phone: '+995 571 93 03 59' },
  { name: 'თინათინ გვეტაძე', department: 'ფინანსური განყოფილების სამსახური', email: 'tinatin.gvetadze@asg.ge', phone: '+995 577 11 25 11' },
  { name: 'გიგი გამყრელიძე', department: 'კომერციული დეპარტამენტი', email: 'gigi.gamkrelidze@asg.ge', phone: '+995 592 18 40 01' },
  { name: 'ჯანო გაბისონია', department: 'ტექნიკური დეპარტამენტი (ჯგუფი 3)', email: 'jano.gabisonia@asg.ge', phone: '+995 568 61 85 56' },
  { name: 'ჯემიკო ბოდოკია', department: 'IT დეპარტამენტი', email: 'jemiko.bodokia@asg.ge', phone: '+995 599 22 47 74' },
  { name: 'მარიამ ბერაძე', department: 'HR დეპარტამენტი', email: 'mariam.beradze@asg.ge', phone: '+995 598 18 03 19' },
  { name: 'ლიკა ალადაშვილი', department: 'კომერციული დეპარტამენტი', email: 'lika.aladashvili@asg.ge', phone: '+995 595 25 79 78' },
  { name: 'Farid Karimov', department: 'All Service Group', email: 'farid.karimov@aqq.az', phone: '+994 55 653 46 76' },
  { name: 'Lala Gadirova', department: 'Operation and Call Centre - AZ', email: 'lala.gadirova@aqq.az', phone: null },
  { name: 'Accountants Email Forwarder', department: 'All Service Group', email: 'mariam.allservice@gmail.com', phone: null },
  { name: 'მარიამ მალიჩავა', department: 'Operators Tbilisi', email: 'mariam.malichava@asg.ge', phone: '+995 593 64 30 39' },
];

// Extract unique departments
function getUniqueDepartments(): { name: string; code: string }[] {
  const deptMap = new Map<string, string>();
  
  for (const emp of employeeData) {
    const dept = emp.department.trim();
    if (!deptMap.has(dept)) {
      // Generate a code from the department name
      const code = dept
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .split(' ')
        .map(w => w.substring(0, 3).toUpperCase())
        .join('_')
        .substring(0, 20) || 'DEPT';
      deptMap.set(dept, code);
    }
  }

  return Array.from(deptMap.entries()).map(([name, code]) => ({ name, code }));
}

// Parse name into firstName and lastName
function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  // First part is firstName, rest is lastName
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

// Clean phone number
function cleanPhone(phone: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log('🌱 Seeding departments and employees from Excel data...\n');

  // 1. Create departments
  console.log('Creating departments...');
  const departments = getUniqueDepartments();
  const deptIdMap = new Map<string, string>();

  for (const dept of departments) {
    // Check if department already exists
    let existing = await prisma.department.findFirst({
      where: { name: dept.name },
    });

    if (!existing) {
      // Try to find by code, if exists modify code
      let code = dept.code;
      let attempt = 0;
      while (await prisma.department.findUnique({ where: { code } })) {
        attempt++;
        code = `${dept.code}_${attempt}`;
      }

      existing = await prisma.department.create({
        data: {
          name: dept.name,
          code,
          isActive: true,
        },
      });
      console.log(`  ✅ Created department: ${dept.name} (${code})`);
    } else {
      console.log(`  ⏭️  Department exists: ${dept.name}`);
    }
    
    deptIdMap.set(dept.name, existing.id);
  }
  console.log(`\n📁 Total departments: ${departments.length}\n`);

  // 2. Get the next employee ID
  let empCounter = await prisma.employee.count() + 1;

  // 3. Create employees
  console.log('Creating employees...');
  let created = 0;
  let skipped = 0;

  for (const emp of employeeData) {
    // Check if employee already exists by email
    const existing = await prisma.employee.findUnique({
      where: { email: emp.email.toLowerCase().replace(' ', '') },
    });

    if (existing) {
      console.log(`  ⏭️  Employee exists: ${emp.name} (${emp.email})`);
      skipped++;
      continue;
    }

    const { firstName, lastName } = parseName(emp.name);
    const departmentId = deptIdMap.get(emp.department.trim());
    const phone = cleanPhone(emp.phone);

    // Generate employee ID
    const employeeId = `EMP-${String(empCounter).padStart(3, '0')}`;
    empCounter++;

    try {
      await prisma.employee.create({
        data: {
          firstName,
          lastName,
          email: emp.email.toLowerCase().replace(' ', ''),
          phone,
          employeeId,
          departmentId,
          status: EmployeeStatus.ACTIVE,
        },
      });
      console.log(`  ✅ Created employee: ${firstName} ${lastName} (${employeeId})`);
      created++;
    } catch (error: any) {
      console.log(`  ❌ Failed to create ${emp.name}: ${error.message}`);
    }
  }

  console.log(`\n👥 Employees: ${created} created, ${skipped} skipped (already exist)`);
  console.log('\n🎉 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('Error seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  });
