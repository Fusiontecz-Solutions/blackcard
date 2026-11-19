import type { Request, Response } from 'express';
import * as roleService from '../services/roleService';

class RoleController {
  async getRoles(req: Request, res: Response): Promise<Response> {
    try {
      const roles = await roleService.getRoles();
      return res.status(200).json({
        success: true,
        data: roles,
      });
    } catch (error) {
      console.error('Get roles error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}

const roleController = new RoleController();
export default roleController;
