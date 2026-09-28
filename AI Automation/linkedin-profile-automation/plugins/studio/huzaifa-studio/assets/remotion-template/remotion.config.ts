import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setConcurrency(null); // one worker per core
// Inter has to arrive and the still has to measure itself before the first
// frame is captured. A slow font fetch on a cold machine should not fail a
// render, so the window is generous.
Config.setDelayRenderTimeoutInMilliseconds(45000);
