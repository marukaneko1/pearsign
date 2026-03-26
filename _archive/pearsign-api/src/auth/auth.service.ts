import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Create organization first
    const organization = this.organizationRepository.create({
      name: dto.organizationName,
      plan: 'free',
      isActive: true,
    });

    const savedOrganization =
      await this.organizationRepository.save(organization);

    // Create owner user
    const user = this.userRepository.create({
      email: dto.email,
      password: dto.password, // Will be hashed by @BeforeInsert
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: UserRole.OWNER,
      organizationId: savedOrganization.id,
      isActive: true,
      emailVerified: false, // Should be verified via email
    });

    const savedUser = await this.userRepository.save(user);

    // Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(savedUser);

    // Save refresh token
    savedUser.refreshToken = await bcrypt.hash(refreshToken, 10);
    await this.userRepository.save(savedUser);

    return {
      user: this.sanitizeUser(savedUser),
      accessToken,
      refreshToken,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
      relations: ['organization'],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    if (!user.organization.isActive) {
      throw new UnauthorizedException('Organization is inactive');
    }

    const isPasswordValid = await user.validatePassword(dto.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(user);

    // Save refresh token and update last login
    user.refreshToken = await bcrypt.hash(refreshToken, 10);
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    return {
      user: this.sanitizeUser(user),
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('app.refreshTokenSecret'),
      });

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
        relations: ['organization'],
      });

      if (!user || !user.refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isTokenValid = await bcrypt.compare(token, user.refreshToken);

      if (!isTokenValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      // Update refresh token
      user.refreshToken = await bcrypt.hash(tokens.refreshToken, 10);
      await this.userRepository.save(user);

      return tokens;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(userId: string) {
    await this.userRepository.update(userId, { refreshToken: undefined });
    return { message: 'Logged out successfully' };
  }

  private async generateTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret:
        this.configService.get<string>('app.jwtSecret') || 'fallback-secret',
      expiresIn: this.configService.get('app.jwtExpiresIn') || '15m',
    } as any);

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret:
        this.configService.get<string>('app.refreshTokenSecret') ||
        'fallback-refresh-secret',
      expiresIn: this.configService.get('app.refreshTokenExpiresIn') || '7d',
    } as any);

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: User) {
    const {
      password,
      refreshToken,
      passwordResetToken,
      emailVerificationToken,
      ...sanitized
    } = user;
    return sanitized;
  }
}
