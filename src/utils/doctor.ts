/**
 * Dependency checker - verifies all required tools are installed
 */

interface DependencyCheck {
  name: string;
  command: string;
  required: boolean;
  installInstructions: {
    darwin: string;
    linux: string;
    win32: string;
  };
}

const DEPENDENCIES: DependencyCheck[] = [
  {
    name: 'OpenCode CLI',
    command: 'opencode',
    required: true,
    installInstructions: {
      darwin: 'curl -fsSL https://opencode.ai/install.sh | sh',
      linux: 'curl -fsSL https://opencode.ai/install.sh | sh',
      win32: 'Visit https://opencode.ai for Windows installation',
    },
  },
  {
    name: 'Tailscale',
    command: 'tailscale',
    required: false, // Optional - only needed for proxy feature
    installInstructions: {
      darwin: 'brew install tailscale  # or download from https://tailscale.com/download',
      linux: 'curl -fsSL https://tailscale.com/install.sh | sh',
      win32: 'Download from https://tailscale.com/download',
    },
  },
];

async function checkCommand(command: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(['which', command], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

async function checkTailscaleStatus(): Promise<{ connected: boolean; hostname?: string }> {
  try {
    const proc = Bun.spawn(['tailscale', 'status', '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    
    if (proc.exitCode !== 0) {
      return { connected: false };
    }
    
    const status = JSON.parse(output);
    return {
      connected: status.BackendState === 'Running',
      hostname: status.Self?.DNSName?.replace(/\.$/, ''),
    };
  } catch {
    return { connected: false };
  }
}

function getPlatform(): 'darwin' | 'linux' | 'win32' {
  const platform = process.platform;
  if (platform === 'darwin' || platform === 'linux' || platform === 'win32') {
    return platform;
  }
  return 'linux'; // Default to linux for unknown platforms
}

export async function runDoctor(): Promise<boolean> {
  console.log('\n🔍 Checking dependencies...\n');
  
  const platform = getPlatform();
  let allRequiredOk = true;
  
  for (const dep of DEPENDENCIES) {
    const installed = await checkCommand(dep.command);
    const status = installed ? '✅' : (dep.required ? '❌' : '⚠️');
    const label = dep.required ? '' : ' (optional)';
    
    console.log(`${status} ${dep.name}${label}`);
    
    if (!installed) {
      if (dep.required) {
        allRequiredOk = false;
      }
      console.log(`   Install: ${dep.installInstructions[platform]}\n`);
    }
  }
  
  // Check Tailscale connection status if installed
  const tailscaleInstalled = await checkCommand('tailscale');
  if (tailscaleInstalled) {
    console.log('\n🌐 Checking Tailscale status...');
    const tsStatus = await checkTailscaleStatus();
    
    if (tsStatus.connected) {
      console.log(`✅ Tailscale connected`);
      if (tsStatus.hostname) {
        console.log(`   Hostname: ${tsStatus.hostname}`);
      }
    } else {
      console.log('⚠️  Tailscale not connected');
      console.log('   Run: tailscale up');
    }
  }
  
  console.log('\n' + '─'.repeat(50));
  
  if (allRequiredOk) {
    console.log('✅ All required dependencies are installed!\n');
    return true;
  } else {
    console.log('❌ Some required dependencies are missing. Please install them first.\n');
    return false;
  }
}

/**
 * Quick check for required dependencies (used on startup)
 */
export async function checkRequiredDependencies(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  
  for (const dep of DEPENDENCIES) {
    if (dep.required) {
      const installed = await checkCommand(dep.command);
      if (!installed) {
        missing.push(dep.name);
      }
    }
  }
  
  return { ok: missing.length === 0, missing };
}

/**
 * Get Tailscale hostname if connected
 */
export async function getTailscaleHostname(): Promise<string | undefined> {
  const status = await checkTailscaleStatus();
  return status.hostname;
}
