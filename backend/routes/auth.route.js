import express from 'express';
import { signup } from '../controllers/auth.controller.js';

const router = express.Router();

// Defines the POST endpoint that the frontend calls
router.post('/signup', signup);

export default router;
