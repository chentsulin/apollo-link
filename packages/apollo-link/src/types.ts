import Observable from 'zen-observable-ts';
import { ExecutionResult, DocumentNode } from 'graphql';

export interface GraphQLRequest {
  query: DocumentNode;
  variables?: Record<string, any>;
  operationName?: string;
  context?: Record<string, any>;
  extensions?: Record<string, any>;
}

export interface Operation {
  query: DocumentNode;
  variables: Record<string, any>;
  operationName: string;
  extensions: Record<string, any>;
  setContext: (context: Record<string, any>) => Record<string, any>;
  getContext: () => Record<string, any>;
  toKey: () => string;
}

export type FetchResult<
  C = Record<string, any>,
  E = Record<string, any>
> = ExecutionResult & {
  extensions?: E;
  context?: C;
};

export type NextLink = (operation: Operation) => Observable<FetchResult>;
export type RequestHandler = (
  operation: Operation,
  forward?: NextLink,
) => Observable<FetchResult> | null;
