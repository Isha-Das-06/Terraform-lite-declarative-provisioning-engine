export interface Resource {
  type: string;
  name: string;
  attributes: Record<string, any>;
  depends_on?: string[];
  provider?: string;
}

export interface ResourceState {
  type: string;
  name: string;
  id: string;
  attributes: Record<string, any>;
  timestamp: number;
}

export interface State {
  version: number;
  terraform_version: string;
  serial: number;
  lineage: string;
  resources: ResourceState[];
  checkpoints: StateCheckpoint[];
}

export interface StateCheckpoint {
  serial: number;
  resources: ResourceState[];
  timestamp: number;
  description: string;
}

export interface Config {
  terraform?: {
    required_version?: string;
  };
  variable?: Record<string, VariableDefinition>;
  provider?: Record<string, ProviderConfig>;
  resource?: Record<string, Record<string, any>>;
  output?: Record<string, OutputDefinition>;
}

export interface VariableDefinition {
  type?: string;
  description?: string;
  default?: any;
  sensitive?: boolean;
  validation?: {
    condition: string;
    error_message: string;
  };
}

export interface OutputDefinition {
  value: string;
  description?: string;
  sensitive?: boolean;
  depends_on?: string[];
}

export interface ProviderConfig {
  version?: string;
  [key: string]: any;
}

export type DiffOperation = "create" | "update" | "delete" | "no-op";

export interface ResourceDiff {
  operation: DiffOperation;
  type: string;
  name: string;
  id?: string;
  old_attributes?: Record<string, any>;
  new_attributes?: Record<string, any>;
}

export interface Plan {
  serial: number;
  changes: ResourceDiff[];
  resource_count: {
    create: number;
    update: number;
    delete: number;
  };
  timestamp: number;
}

export interface ApplyResult {
  success: boolean;
  resources_created: string[];
  resources_updated: string[];
  resources_deleted: string[];
  errors: string[];
  duration_ms: number;
}

export interface RollbackResult {
  success: boolean;
  restored_resources: string[];
  errors: string[];
}

export interface ProviderResource {
  type: string;
  name: string;
  id: string;
  attributes: Record<string, any>;
}

export interface GraphNode {
  id: string;
  type: string;
  name: string;
  dependencies: string[];
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: Map<string, string[]>;
  hasCycles: boolean;
  cycles: string[][];
}
