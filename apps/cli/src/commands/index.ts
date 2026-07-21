import type { Command } from 'commander';
import { registerApplyCommand } from './apply.js';
import { registerCompileCommand } from './compile.js';
import { registerFormatCommand } from './format.js';
import { registerGraphCommand } from './graph.js';
import { registerInitCommand } from './init.js';
import { registerInspectCommand } from './inspect.js';
import { registerPlanCommand } from './plan.js';
import { registerStatusCommand } from './status.js';
import { registerTestCommand } from './test.js';
import { registerValidateCommand } from './validate.js';

export function registerCommands(program: Command): void {
  registerInitCommand(program);
  registerValidateCommand(program);
  registerFormatCommand(program);
  registerInspectCommand(program);
  registerGraphCommand(program);
  registerPlanCommand(program);
  registerStatusCommand(program);
  registerCompileCommand(program);
  registerTestCommand(program);
  registerApplyCommand(program);
}
