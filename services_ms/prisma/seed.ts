import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcryptjs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Define Permissions
  const permissionsList = [
    'edit_profile',
    'read_transcripts',
    'create_transcripts',
    'update_transcripts',
    'delete_transcripts',
    'manage_users',
    'manage_roles',
    // User management permissions
    'read_users',
    'create_users',
    'update_users',
    'delete_users',
    // Role and Permission management permissions
    'read_roles',
    'create_roles',
    'update_roles',
    'delete_roles',
    'read_permissions',
    'update_role_permissions',
    // New page-level check permissions
    'manage_user',
    'manage_role',
    'manage_meeting',
    'manage_file',
    'manage_transcription',
  ];

  console.log('Permissions seeding...');
  const permissionsMap: Record<string, number> = {};
  for (const permName of permissionsList) {
    const perm = await prisma.permission.upsert({
      where: { name: permName },
      update: {},
      create: { name: permName },
    });
    permissionsMap[permName] = perm.id;
  }
  console.log(`✅ Seeded ${Object.keys(permissionsMap).length} permissions.`);

  // 2. Define Roles
  const rolesList = ['ADMIN', 'USER'];

  console.log('Roles seeding...');
  const rolesMap: Record<string, number> = {};
  for (const roleName of rolesList) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName },
    });
    rolesMap[roleName] = role.id;
  }
  console.log(`✅ Seeded ${Object.keys(rolesMap).length} roles.`);

  // 3. Define Role Permissions
  console.log('Role Permissions seeding...');
  
  // ADMIN role gets all permissions
  const adminRolePermissions = permissionsList;
  for (const permName of adminRolePermissions) {
    const roleId = rolesMap['ADMIN'];
    const permissionId = permissionsMap[permName];
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId,
          permissionId,
        },
      },
      update: {},
      create: {
        roleId,
        permissionId,
      },
    });
  }

  // USER role gets edit_profile, read_transcripts, manage_meeting, manage_file, and manage_transcription
  const userRolePermissions = ['edit_profile', 'read_transcripts', 'manage_meeting', 'manage_file', 'manage_transcription'];
  for (const permName of userRolePermissions) {
    const roleId = rolesMap['USER'];
    const permissionId = permissionsMap[permName];
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId,
          permissionId,
        },
      },
      update: {},
      create: {
        roleId,
        permissionId,
      },
    });
  }
  console.log('✅ Associated permissions to roles successfully.');

  // 4. Create/Upsert Admin Account (admin@gmail.com / admin123)
  console.log('Admin Account seeding...');
  const adminEmail = 'admin@gmail.com';
  let adminAccount = await prisma.account.findUnique({
    where: { email: adminEmail },
  });

  if (!adminAccount) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    adminAccount = await prisma.account.create({
      data: {
        email: adminEmail,
        password: hashedPassword,
      },
    });
    console.log(`✅ Created new admin account with ID: ${adminAccount.id}`);
  } else {
    console.log(`ℹ️ Admin account already exists (ID: ${adminAccount.id}).`);
  }

  // 5. Assign ADMIN Role to Admin Account
  const adminRoleId = rolesMap['ADMIN'];
  await prisma.accountRole.upsert({
    where: {
      accountId_roleId: {
        accountId: adminAccount.id,
        roleId: adminRoleId,
      },
    },
    update: {},
    create: {
      accountId: adminAccount.id,
      roleId: adminRoleId,
    },
  });
  console.log('✅ Assigned ADMIN role to admin account.');

  // 6. Create/Upsert UserProfile for Admin
  await prisma.userProfile.upsert({
    where: { id: adminAccount.id },
    update: {
      name: 'Administrator',
      email: adminEmail,
    },
    create: {
      id: adminAccount.id,
      name: 'Administrator',
      email: adminEmail,
      bio: 'System Administrator',
    },
  });
  console.log('✅ Seeded UserProfile for admin account.');

  console.log('🌱 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
