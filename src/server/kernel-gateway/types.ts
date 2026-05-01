import type { WebSocket } from "ws";

export type KernelState = "starting" | "idle" | "busy" | "dead";

export interface KernelInfo {
  id: string;
  name: string;
  state: KernelState;
}

export interface KernelOutput {
  type: "stream" | "display_data" | "execute_result" | "error" | "status";
  text?: string;
  data?: Record<string, unknown>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
  status?: string;
}

export interface IKernelGatewayAdapter {
  readonly name: string;
  isConfigured(): boolean;
  listKernels(): Promise<KernelInfo[]>;
  startKernel(kernelName?: string): Promise<KernelInfo>;
  stopKernel(id: string): Promise<void>;
  relay(kernelId: string, clientSocket: WebSocket): Promise<void>;
}
