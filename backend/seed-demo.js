const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');
const prisma = new PrismaClient();

async function seed() {
  console.log('=== Seeding Demo Data ===\n');
  
  // Find or create demo user
  let user = await prisma.user.findUnique({ where: { email: 'demo@togglely.io' } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'demo@togglely.io',
        password: '$2a$10$KfoUUR3eup3m/ohIuuLInu37h9rJBLcZO2zdfmcJyY5HRh5DPhAAW',
        firstName: 'Demo',
        lastName: 'User',
      },
    });
    console.log('Created user:', user.id);
  } else {
    console.log('Found existing user:', user.id);
  }
  
  // Create demo organization
  const org = await prisma.organization.create({
    data: {
      name: 'Demo Organization',
      slug: randomUUID(),
    },
  });
  console.log('Created org:', org.id);
  
  // Create organization member
  await prisma.organizationMember.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      role: 'OWNER',
    },
  });
  
  // Create demo project (MULTI tenant)
  const project = await prisma.project.create({
    data: {
      name: 'Demo Project',
      key: 'demo',
      description: 'Demo project for testing',
      type: 'MULTI',
      organizationId: org.id,
      environments: {
        create: [
          { name: 'Development', key: 'development', organizationId: org.id },
          { name: 'Production', key: 'production', organizationId: org.id },
        ],
      },
    },
    include: { environments: true },
  });
  console.log('Created project:', project.id);
  
  const devEnv = project.environments.find(e => e.key === 'development');
  
  // Create brands
  const brandA = await prisma.brand.create({
    data: { name: 'Brand A', key: 'brand-a', projectId: project.id },
  });
  const brandB = await prisma.brand.create({
    data: { name: 'Brand B', key: 'brand-b', projectId: project.id },
  });
  console.log('Created brands: brand-a, brand-b');
  
  // Create feature flags
  const flag1 = await prisma.featureFlag.create({
    data: {
      name: 'New Feature',
      key: 'new-feature',
      flagType: 'BOOLEAN',
      projectId: project.id,
      organizationId: org.id,
      createdById: user.id,
    },
  });
  
  const flag2 = await prisma.featureFlag.create({
    data: {
      name: 'Dark Mode',
      key: 'dark-mode',
      flagType: 'BOOLEAN',
      projectId: project.id,
      organizationId: org.id,
      createdById: user.id,
    },
  });
  console.log('Created flags: new-feature, dark-mode');
  
  // Create flag environments
  // new-feature: enabled for brand-a, disabled for brand-b
  await prisma.flagEnvironment.createMany({
    data: [
      { flagId: flag1.id, environmentId: devEnv.id, brandId: null, enabled: true, defaultValue: 'true' },
      { flagId: flag1.id, environmentId: devEnv.id, brandId: brandA.id, enabled: true, defaultValue: 'true' },
      { flagId: flag1.id, environmentId: devEnv.id, brandId: brandB.id, enabled: false, defaultValue: 'false' },
      { flagId: flag2.id, environmentId: devEnv.id, brandId: null, enabled: true, defaultValue: 'true' },
      { flagId: flag2.id, environmentId: devEnv.id, brandId: brandA.id, enabled: true, defaultValue: 'true' },
      { flagId: flag2.id, environmentId: devEnv.id, brandId: brandB.id, enabled: true, defaultValue: 'true' },
    ],
  });
  
  console.log('\n✅ Demo data created!');
  console.log('\nTest URLs:');
  console.log('All flags for brand-a: http://localhost:4000/sdk/flags/demo/development?tenantId=brand-a');
  console.log('All flags for brand-b: http://localhost:4000/sdk/flags/demo/development?tenantId=brand-b');
  console.log('Single flag: http://localhost:4000/sdk/flags/demo/development/new-feature?tenantId=brand-a');
  
  await prisma.$disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
