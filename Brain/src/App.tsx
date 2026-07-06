import { NeuralBrainCanvas } from './components/NeuralBrainCanvas';

export default function App() {
  return (
    <section className="relative min-h-[100vh] w-full overflow-hidden bg-[#040102] text-white flex items-center justify-center py-20 px-4 sm:px-6 lg:px-8">
      {/* Background layer container */}
      <div className="absolute inset-0 z-0">
        <NeuralBrainCanvas className="opacity-85 transition-opacity duration-1000" />

        {/* Subtle grid pattern overlay */}
        <div
          className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:44px_44px] mix-blend-screen"
          style={{
            maskImage:
              'radial-gradient(circle at center, black 10%, transparent 75%)',
            WebkitMaskImage:
              'radial-gradient(circle at center, black 10%, transparent 75%)',
          }}
        />

        {/* Dark radial gradient mask — lighter so the brain shows through */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(4,1,2,0.65)_0%,rgba(4,1,2,0.25)_45%,rgba(4,1,2,0.85)_100%)] pointer-events-none" />

        {/* Bottom vertical masking gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#040102] via-transparent to-transparent opacity-90 pointer-events-none" />

        {/* Top ambient color glow */}
        <div className="absolute top-0 left-0 w-full h-2/5 bg-gradient-to-b from-[#ff3c0010] via-transparent to-transparent blur-3xl pointer-events-none" />
      </div>

      {/* Foreground Interactive Content Zone */}
      <div className="relative z-10 max-w-5xl mx-auto text-center space-y-8 pointer-events-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#ff4d1212] to-[#ffae3d12] border border-[#ff4d1225] backdrop-blur-md animate-fade-in">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ffae3d] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff4d12]"></span>
          </span>
          <span className="text-[11px] font-medium tracking-wider text-[#ffae3d] uppercase font-mono">
            Next-Gen AI Core Architecture
          </span>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-balance leading-[1.15] animate-fade-in-up">
          Architecting Human
          <span className="block mt-2 bg-gradient-to-r from-[#fff0c2] via-[#ffae3d] to-[#ff2317] bg-clip-text text-transparent drop-shadow-[0_2px_35px_rgba(255,77,18,0.2)]">
            Intelligence in Code
          </span>
        </h1>

        <p className="max-w-2xl mx-auto text-base sm:text-lg text-neutral-400 font-normal leading-relaxed text-balance animate-fade-in-up-delay">
          Deploy production-grade, self-optimizing LLMs inside an interconnected
          synapse fabric. Bridge natural intuition with deterministic canvas
          acceleration natively.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 animate-fade-in-up-delay2">
          <button className="group relative px-6 py-3.5 w-full sm:w-auto rounded-lg font-medium text-black bg-[#ffae3d] transition-all duration-300 hover:bg-[#fff0c2] hover:shadow-[0_0_30px_rgba(255,174,61,0.35)] active:scale-[0.98] cursor-pointer">
            Initialize Canvas
            <span className="inline-block ml-2 transform transition-transform group-hover:translate-x-1 font-mono">
              →
            </span>
          </button>

          <button className="px-6 py-3.5 w-full sm:w-auto rounded-lg font-medium text-neutral-300 bg-white/5 border border-white/10 backdrop-blur-md transition-all duration-300 hover:bg-white/10 hover:border-white/20 active:scale-[0.98] font-mono text-sm cursor-pointer">
            cat config.json
          </button>
        </div>

        {/* Diagnostic Metadata Grid */}
        <div className="pt-12 grid grid-cols-2 sm:grid-cols-3 gap-6 max-w-xl mx-auto border-t border-white/5 text-left font-mono animate-fade-in-up-delay3">
          <div>
            <div className="text-xs text-neutral-500">SYNAPSE_COUNT</div>
            <div className="text-sm font-semibold text-neutral-300">
              6,100 Nodes
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">POST_PROCESS</div>
            <div className="text-sm font-semibold text-[#ff4d12]">
              UnrealBloom
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-xs text-neutral-500">RENDER_PIPELINE</div>
            <div className="text-sm font-semibold text-neutral-300">
              WebGL 2.0 + ACES
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
