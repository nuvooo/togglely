import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function main() {
  console.log('🌱 Seeding database...');

  // Check if demo user exists
  const existingUser = await prisma.user.findUnique({
    where: { email: 'demo@togglely.io' }
  });

  if (existingUser) {
    console.log('Demo user already exists, skipping seed');
    return;
  }

  // Create demo user
  const hashedPassword = await hashPassword('demo123!');
  
  const user = await prisma.user.create({
    data: {
      email: 'demo@togglely.io',
      password: hashedPassword,
      firstName: 'Demo',
      lastName: 'User'
    }
  });

  console.log('Created demo user:', user.email);

  // Create organization
  const org = await prisma.organization.create({
    data: {
      name: 'Demo Organization',
      slug: 'demo-organization',
      description: 'A demo organization for testing'
    }
  });

  console.log('Created organization:', org.name);

  // Add user as owner
  await prisma.organizationMember.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      role: 'OWNER'
    }
  });

  // Create project
  const project = await prisma.project.create({
    data: {
      name: 'Demo Project',
      key: 'demo-project',
      description: 'A demo project with sample feature flags',
      organizationId: org.id
    }
  });

  console.log('Created project:', project.name);

  // Create environments
  const devEnv = await prisma.environment.create({
    data: {
      name: 'Development',
      key: 'development',
      projectId: project.id,
      organizationId: org.id
    }
  });

  const prodEnv = await prisma.environment.create({
    data: {
      name: 'Production',
      key: 'production',
      projectId: project.id,
      organizationId: org.id
    }
  });

  console.log('Created environments');

  // Create sample feature flags
  const flags = [
    {
      name: 'New Dashboard',
      key: 'new-dashboard',
      description: 'Enable the new dashboard UI',
      flagType: 'BOOLEAN' as const,
      devEnabled: true,
      prodEnabled: false,
      defaultValue: 'false'
    },
    {
      name: 'Dark Mode',
      key: 'dark-mode',
      description: 'Enable dark mode theme',
      flagType: 'BOOLEAN' as const,
      devEnabled: true,
      prodEnabled: true,
      defaultValue: 'true'
    },
    {
      name: 'Max Items Per Page',
      key: 'max-items-per-page',
      description: 'Maximum number of items to display per page',
      flagType: 'NUMBER' as const,
      devEnabled: true,
      prodEnabled: true,
      defaultValue: '10'
    },
    {
      name: 'Welcome Message',
      key: 'welcome-message',
      description: 'Custom welcome message for users',
      flagType: 'STRING' as const,
      devEnabled: true,
      prodEnabled: true,
      defaultValue: 'Welcome to our app!'
    }
  ];

  for (const flagData of flags) {
    const flag = await prisma.featureFlag.create({
      data: {
        name: flagData.name,
        key: flagData.key,
        description: flagData.description,
        flagType: flagData.flagType,
        organizationId: org.id,
        projectId: project.id,
        createdById: user.id,
        flagEnvironments: {
          create: [
            {
              environmentId: devEnv.id,
              enabled: flagData.devEnabled,
              defaultValue: flagData.defaultValue
            },
            {
              environmentId: prodEnv.id,
              enabled: flagData.prodEnabled,
              defaultValue: flagData.defaultValue
            }
          ]
        }
      }
    });
    console.log('Created flag:', flag.name);
  }

  // Create a demo API key
  const apiKey = await prisma.apiKey.create({
    data: {
      name: 'Demo SDK Key',
      key: 'togglely_demo_sdk_key_for_testing_purposes_only',
      type: 'SDK',
      organizationId: org.id,
      userId: user.id
    }
  });

  console.log('Created API key:', apiKey.name);

  console.log('✅ Seed completed successfully!');
  console.log('');
  console.log('Demo credentials:');
  console.log('  Email: demo@togglely.io');
  console.log('  Password: demo123!');
  console.log('');
  console.log('Demo API Key: togglely_demo_sdk_key_for_testing_purposes_only');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
