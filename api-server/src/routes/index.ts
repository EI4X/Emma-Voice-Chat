import { Router, type IRouter } from "express";
import healthRouter from "./health";
import openaiRouter from "./openai/index";
import emmaRouter from "./emma/index";
import pathfinderRouter from "./pathfinder/index";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/openai", openaiRouter);
router.use("/emma", emmaRouter);
router.use("/pathfinder", pathfinderRouter);

export default router;
