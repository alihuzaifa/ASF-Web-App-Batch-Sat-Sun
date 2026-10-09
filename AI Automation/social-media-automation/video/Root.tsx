import React from "react"
import { Composition, Still } from "remotion"
import { Post } from "./Post"
import { Short, shortPlan } from "./Short"
import { Tour, tourPlan } from "./Tour"
import { Walkthrough, walkLength, type WalkProps } from "./Walkthrough"
import { FPS, SIZES, type Props } from "./types"

// Sample props so `npm run studio` opens on something. The app always passes real ones.
const sample: Props = {
  shape: "square",
  assetBase: "",
  brief: {
    name: "Sample",
    oneLine: "Open the app and read a project first.",
    forWho: "",
    features: ["One", "Two", "Three"],
    hook: "I built this.",
    handle: "",
    website: "https://example.com",
    accent: "#6d5efc",
    pages: [],
  },
}

export const Root: React.FC = () => (
  <>
    <Still
      id="Post"
      component={Post}
      width={1080}
      height={1080}
      defaultProps={sample}
      calculateMetadata={({ props }) => SIZES[props.shape]}
    />
    <Composition
      id="Short"
      component={Short}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={300}
      defaultProps={{ ...sample, shape: "story" }}
      calculateMetadata={({ props }) => ({ ...SIZES[props.shape], durationInFrames: shortPlan(props).total })}
    />
    <Composition
      id="Tour"
      component={Tour}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={300}
      defaultProps={{ ...sample, shape: "wide" }}
      calculateMetadata={({ props }) => ({ ...SIZES[props.shape], durationInFrames: tourPlan(props).total })}
    />
    <Composition
      id="Walkthrough"
      component={Walkthrough}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={300}
      defaultProps={{ scenes: [] } as WalkProps}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.max(1, walkLength(props)) })}
    />
  </>
)
