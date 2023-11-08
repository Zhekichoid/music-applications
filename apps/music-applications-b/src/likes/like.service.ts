import { Injectable, NotFoundException } from '@nestjs/common';
import { LikeRepository } from './like.repository';
import { InjectRepository } from '@nestjs/typeorm';
import { Like } from './like.entity';
import { User } from '../auth/user.entity';
import { DatabaseService } from '../neo4j/db.service';

@Injectable()
export class LikeService {
  constructor(
    @InjectRepository(Like) private readonly likeRepository: LikeRepository,
    private readonly dbService: DatabaseService
  ) {}

  async createLike(user: User, nodeId: string) {
    await this.dbService.increaseItemLikeCounter(nodeId);
    return await this.likeRepository.createLike(user, nodeId);
  }

  async deleteLike(user: User, nodeId: string) {
    const result = await this.likeRepository.delete({ user, nodeId });

    if (result.affected === 0) {
      throw new NotFoundException(`No like with credentials found.`);
    }
  }

  async isLikeExists(user: User, nodeId: string) {
    try {
      const result = await this.likeRepository.findOneOrFail({
        where: { user, nodeId },
      });

      if (result) {
        return true;
      }
    } catch (error) {
      return false;
    }
  }

  async findUserLikes(user: User) {
    try {
      const result = await this.likeRepository.find({ where: { user } });
      return result;
    } catch (error) {
      console.log(error);
      return [];
    }
  }
}
