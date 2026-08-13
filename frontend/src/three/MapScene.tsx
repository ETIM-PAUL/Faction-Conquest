import { Canvas } from "@react-three/fiber";
import { FACTION_COLOR, type Faction } from "../contracts/faction";
import { useMapState } from "../hooks/useFactionWar";

/// Phase 4 (Build.md section 4.2) — the single place to spend visual budget.
/// This is the structural skeleton only: hex/square grid, locked top-down
/// camera, static directional + ambient lighting, tile color = controller.
///
/// Deliberately NOT built yet, in cut-list order (Build.md 4.4):
///   1. Contested-zone glow/outline on live (unresolved) attacks.
///   2. Height-encoded contest intensity (taller = more tickets this round).
///   3. Particle burst on capture.
///   4. Camera focus-in on resolution.
/// Build the color-flip capture moment (reacting to ZonesResolved events)
/// before any of the above — it's the one 3D beat Build.md says never to cut.

const GRID_COLUMNS = 10;
const TILE_SIZE = 1;
const TILE_GAP = 0.15;

function Tile({ index, controller }: { index: number; controller: Faction }) {
  const col = index % GRID_COLUMNS;
  const row = Math.floor(index / GRID_COLUMNS);
  const x = col * (TILE_SIZE + TILE_GAP);
  const z = row * (TILE_SIZE + TILE_GAP);

  return (
    <mesh position={[x, 0, z]}>
      <boxGeometry args={[TILE_SIZE, 0.3, TILE_SIZE]} />
      <meshStandardMaterial color={FACTION_COLOR[controller]} />
    </mesh>
  );
}

export function MapScene() {
  const { data } = useMapState();
  if (!data) return null;

  const [ballMax, controllers] = data;
  const rows = Math.ceil(ballMax / GRID_COLUMNS);
  const centerX = ((GRID_COLUMNS - 1) * (TILE_SIZE + TILE_GAP)) / 2;
  const centerZ = ((rows - 1) * (TILE_SIZE + TILE_GAP)) / 2;

  return (
    <Canvas camera={{ position: [centerX, 12, centerZ + 8], fov: 40 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} color="#ffddaa" />
      <group position={[-centerX, 0, -centerZ]}>
        {controllers.map((controller, i) => (
          <Tile key={i} index={i} controller={controller as Faction} />
        ))}
      </group>
    </Canvas>
  );
}
