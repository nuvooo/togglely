import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { Project } from '../../domain/project.entity';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string): Promise<Project[]> {
    // Get user's organization memberships
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      include: { organization: { include: { projects: true } } },
    });
    
    const projects = memberships.flatMap(m => m.organization.projects);
    
    return projects.map(p => Project.reconstitute({
      id: p.id,
      name: p.name,
      key: p.key,
      description: p.description,
      type: p.type as 'SINGLE' | 'MULTI',
      allowedOrigins: p.allowedOrigins,
      organizationId: p.organizationId,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  async create(orgId: string, userId: string, dto: CreateProjectDto): Promise<Project> {
    // Check if user is member of organization
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId: orgId, role: { in: ['OWNER', 'ADMIN'] } },
    });
    
    if (!membership) {
      throw new ForbiddenException('Access denied');
    }

    const normalizedKey = dto.key.trim().toLowerCase();
    
    const existing = await this.prisma.project.findUnique({
      where: { organizationId_key: { organizationId: orgId, key: normalizedKey } },
    });
    
    if (existing) {
      throw new ConflictException(`Project with key '${normalizedKey}' already exists`);
    }

    const project = Project.create({
      name: dto.name,
      key: normalizedKey,
      description: dto.description || null,
      type: dto.type || 'SINGLE',
      allowedOrigins: dto.allowedOrigins || [],
      organizationId: orgId,
    });

    const created = await this.prisma.project.create({
      data: {
        id: project.id,
        name: project.name,
        key: project.key,
        description: project.description,
        type: project.type,
        allowedOrigins: project.allowedOrigins,
        organizationId: project.organizationId,
        environments: {
          create: [
            { name: 'Development', key: 'development', organizationId: orgId },
            { name: 'Production', key: 'production', organizationId: orgId },
          ],
        },
      },
    });

    return Project.reconstitute({
      id: created.id,
      name: project.name,
      key: project.key,
      description: project.description,
      type: project.type,
      allowedOrigins: project.allowedOrigins,
      organizationId: project.organizationId,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  }

  async delete(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check organization membership
    const membership = await this.prisma.organizationMember.findFirst({
      where: { 
        userId, 
        organizationId: project.organizationId, 
        role: { in: ['OWNER', 'ADMIN'] } 
      },
    });
    
    if (!membership) {
      throw new ForbiddenException('Access denied');
    }

    await this.prisma.project.delete({ where: { id: projectId } });
  }

  async findByOrganization(orgId: string, userId: string): Promise<Project[]> {
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId: orgId },
    });

    if (!membership) {
      throw new ForbiddenException('Access denied');
    }

    const projects = await this.prisma.project.findMany({
      where: { organizationId: orgId },
      include: {
        _count: {
          select: { 
            featureFlags: true, 
            environments: true 
          }
        }
      }
    });

    return projects.map(p => {
      const project = Project.reconstitute({
        id: p.id,
        name: p.name,
        key: p.key,
        description: p.description || '',
        type: p.type as 'SINGLE' | 'MULTI',
        allowedOrigins: p.allowedOrigins,
        organizationId: p.organizationId,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      });

      // Attach counts for controller
      (project as any).featureFlagCount = p._count.featureFlags;
      (project as any).environmentCount = p._count.environments;

      return project;
    });
  }
}
