export type MapInitializationOptions = {
  reloadAssets: () => Promise<void>;
  prepareFirstReadyState: () => void;
  renderWorkspace: () => void;
  syncViewport: () => void;
  bindInteractions: () => void;
  commitFirstReadyState: () => void;
};

export class MapInitializationController {
  private readonly options: MapInitializationOptions;
  private initializedValue = false;
  private operation: Promise<void> | null = null;

  constructor(options: MapInitializationOptions) {
    this.options = options;
  }

  get initialized(): boolean {
    return this.initializedValue;
  }

  initialize(): Promise<void> {
    if (this.operation) {
      return this.operation;
    }
    const operation = this.initializeOnce();
    this.operation = operation;
    void operation.then(
      () => this.clearOperation(operation),
      () => this.clearOperation(operation),
    );
    return operation;
  }

  private async initializeOnce(): Promise<void> {
    await this.options.reloadAssets();
    const firstReady = !this.initializedValue;
    if (firstReady) {
      this.options.prepareFirstReadyState();
    }
    this.options.renderWorkspace();
    this.options.syncViewport();
    this.options.bindInteractions();
    this.initializedValue = true;
    if (firstReady) {
      this.options.commitFirstReadyState();
    }
  }

  private clearOperation(operation: Promise<void>): void {
    if (this.operation === operation) {
      this.operation = null;
    }
  }
}
