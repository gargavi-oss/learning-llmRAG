import {Router} from "express";
import { getResponse } from "../controllers/aiController";

 const router= Router();

router.post("/ai",getResponse);


export default router;