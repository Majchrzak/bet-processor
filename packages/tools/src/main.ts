#!/usr/bin/env node

import { Command } from "commander";

const program = new Command()
  .name("bet-processor-tools")
  .description("Operational tools for bet-processor");

await program.parseAsync();
