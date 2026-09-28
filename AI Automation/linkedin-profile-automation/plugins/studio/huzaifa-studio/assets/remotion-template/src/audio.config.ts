/**
 * The music bed for the video.
 *
 * public/audio/studio-bed.mp3 was written and rendered on this machine with
 * FluidSynth and the MuseScore_General SoundFont (MIT), so it carries no
 * third-party licence and nothing needs clearing before a post. If you swap
 * it for another track, only use one you are allowed to use commercially, and
 * record where it came from in `credit` while you still remember.
 *
 * Set `file` to null to render silent.
 */
export const AUDIO = {
  file: 'audio/studio-bed.mp3' as string | null,
  volume: 0.5,
  fadeInSec: 1.2,
  fadeOutSec: 2.0,
  loop: true,
  credit:
    'Written and rendered locally with FluidSynth using the MuseScore_General SoundFont (MIT): FluidR3 by Frank Wen, FluidR3Mono by Michael Cowgill, MuseScore_General adaptation by S. Christian Collins.' as string,
} as const;
