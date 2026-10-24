# Rationale snapshot (author-approved)

- The tour follows the repository's own progression: `Mutex.hpp` → `Fifo3.hpp` → `Fifo4.hpp`.
- Correctness rests on the acquire/release pairing on the two cursors; each cursor has exactly one writer.
- Performance claims (fewer cache misses, higher throughput) are inferences from the design unless a benchmark run is cited.
