import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';

// --- Configuration Setup ---
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080; 
const MONGODB_URI = process.env.MONGO_URI;

// --- Mongoose Schema & Model (User) ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// --- Database Connection ---
const connectDB = async () => {
    try {
        if (!MONGODB_URI) {
            console.error("❌ MONGODB Connection Failed: MONGO_URI is missing. Check your .env file.");
            process.exit(1);
        }
        await mongoose.connect(MONGODB_URI);
        console.log("✅ MongoDB Connected successfully.");
    } catch (error) {
        console.error("❌ MONGODB Connection Failed:", error.message);
        process.exit(1);
    }
};

const app = express();


// --- Controller Functions (Auth) ---
const signupController = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: "Username, email, and password are required!" });
        }

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(409).json({ success: false, message: "User already exists, please login" });
        }

        const hashedPassword = bcryptjs.hashSync(password, 10);
        
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
        });

        await newUser.save();

        // --- UPDATED LOGIC: Log the user in immediately ---
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is not defined in environment variables.");
        }

        const token = jwt.sign(
            { id: newUser._id },
            process.env.JWT_SECRET,
            { expiresIn: "4d" }
        );
        
        const { password: pass, ...rest } = newUser._doc; 
        
        res.cookie("X_TTMS_access_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 4 * 24 * 60 * 60 * 1000,
        }).status(201).json({
            success: true,
            message: "User Created and Logged In Successfully",
            user: rest, // Send the user data back
        });
        // --- END UPDATED LOGIC ---

    } catch (error) {
        console.error("Signup Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server error during signup!",
        });
    }
};

const loginController = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password are required!" });
        }

        const validUser = await User.findOne({ email });
        if (!validUser) {
            return res.status(404).json({ success: false, message: "User not found!" });
        }
        
        const validPassword = bcryptjs.compareSync(password, validUser.password);
        if (!validPassword) {
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is not defined in environment variables.");
        }

        const token = jwt.sign(
            { id: validUser._id },
            process.env.JWT_SECRET,
            { expiresIn: "4d" }
        );
        
        const { password: pass, ...rest } = validUser._doc; 
        
        res.cookie("X_TTMS_access_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 4 * 24 * 60 * 60 * 1000,
        }).status(200).json({
            success: true,
            message: "Login Success",
            user: rest,
        });
    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error during login.",
        });
    }
};

// --- Middleware Configuration ---
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173', 
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());


// --- API Routes (Authentication) ---
const authRouter = express.Router();
authRouter.post('/signup', signupController);
authRouter.post('/login', loginController);

app.use("/api/auth", authRouter); 


// --- Global Error Handler Middleware ---
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    console.error(`[${statusCode}] ${req.method} ${req.originalUrl}: ${message}`);

    if (res.headersSent) {
        return next(err);
    }
    return res.status(statusCode).json({
        success: false,
        statusCode,
        message,
    });
});


/**
 * @description Starts the Express server and handles port errors.
 */
const startServer = () => {
    const server = app.listen(PORT, () => {
        console.log(`🌍 Server is running on port ${PORT}. Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`\n❌ Error: Port ${PORT} is already in use.`);
            console.error("Please stop the existing process before trying again.");
            process.exit(1);
        } else {
            console.error("Server failed to start:", err);
        }
    });
};

// Start the database connection, and only if successful, start the server
connectDB().then(startServer);

