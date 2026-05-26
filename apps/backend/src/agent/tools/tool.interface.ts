export interface Tool {
  name: string;
  description: string;
  execute(input: any, context?: any): Promise<any>;
}
