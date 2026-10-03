import { Router, type IRouter } from "express";
import healthRouter from "./health";
import taskpilotRouter from "./taskpilot";

const router: IRouter = Router();

router.use(healthRouter);
router.use(taskpilotRouter);

export default router;
