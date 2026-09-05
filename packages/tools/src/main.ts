#!/usr/bin/env node

import { Command } from "commander";
import { registerSeedCommand } from "./seed/seed.command";

const program = new Command()
  .name("bet-processor-tools")
  .description("Operational tools for bet-processor");

registerSeedCommand(program);

await program.parseAsync();
