#!/usr/bin/env node

import { Command } from "commander";
import { registerBenchmarkCommand } from "./benchmark/benchmark.command";
import { registerFixtureCommand } from "./fixture/fixture.command";
import { registerGameRunnerCommand } from "./game-runner/game-runner.command";
import { registerSeedCommand } from "./seed/seed.command";

const program = new Command()
  .name("bet-processor-tools")
  .description("Operational tools for bet-processor");

registerBenchmarkCommand(program);
registerFixtureCommand(program);
registerGameRunnerCommand(program);
registerSeedCommand(program);

await program.parseAsync();
