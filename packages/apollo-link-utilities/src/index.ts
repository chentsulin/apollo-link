import { Operation } from 'apollo-link';
import { print } from 'graphql/language/printer';

/*
 * Http Utilities: shared across links that make http requests
 */

// XXX replace with actual typings when available
declare var AbortController: any;

//Used for any Error for data from the server
//on a request with a Status >= 300
//response contains no data or errors
export type ServerError = Error & {
  response: Response;
  result: Record<string, any>;
  statusCode: number;
};

//Thrown when server's resonse is cannot be parsed
export type ServerParseError = Error & {
  response: Response;
  statusCode: number;
  bodyText: string;
};

export type ClientParseError = Error & {
  parseError: Error;
};

export interface HttpQueryOptions {
  includeQuery?: boolean;
  includeExtensions?: boolean;
}

export interface HttpConfig {
  http?: HttpQueryOptions;
  options?: any;
  headers?: any; //overrides headers in options
  credentials?: any;
}

export interface UriFunction {
  (operation: Operation): string;
}

export interface HttpOptions {
  /**
   * The URI to use when fetching operations.
   *
   * Defaults to '/graphql'.
   */
  uri?: string | UriFunction;

  /**
   * Passes the extensions field to your graphql server.
   *
   * Defaults to false.
   */
  includeExtensions?: boolean;

  /**
   * A `fetch`-compatible API to use when making requests.
   */
  fetch?: GlobalFetch['fetch'];

  /**
   * An object representing values to be sent as headers on the request.
   */
  headers?: any;

  /**
   * The credentials policy you want to use for the fetch call.
   */
  credentials?: string;

  /**
   * Any overrides of the fetch options argument to pass to the fetch call.
   */
  fetchOptions?: any;
}

const defaultHttpOptions: HttpQueryOptions = {
  includeQuery: true,
  includeExtensions: false,
};

const defaultHeaders = {
  // headers are case insensitive (https://stackoverflow.com/a/5259004)
  accept: '*/*',
  'content-type': 'application/json',
};

const defaultOptions = {
  method: 'POST',
};

export const fallbackHttpConfig = {
  http: defaultHttpOptions,
  headers: defaultHeaders,
  options: defaultOptions,
};

export const throwServerError = (response, result, message) => {
  const error = new Error(message) as ServerError;

  error.response = response;
  error.statusCode = response.status;
  error.result = result;

  throw error;
};

//TODO: when conditional types come in ts 2.8, operations should be a generic type that extends Operation | Array<Operation>
export const parseAndCheckHttpResponse = operations => (response: Response) => {
  return (
    response
      .text()
      .then(bodyText => {
        try {
          return JSON.parse(bodyText);
        } catch (err) {
          const parseError = err as ServerParseError;
          parseError.response = response;
          parseError.statusCode = response.status;
          parseError.bodyText = bodyText;
          return Promise.reject(parseError);
        }
      })
      //TODO: when conditional types come out then result should be T extends Array ? Array<FetchResult> : FetchResult
      .then((result: any) => {
        if (response.status >= 300) {
          //Network error
          throwServerError(
            response,
            result,
            `Response not successful: Received status code ${response.status}`,
          );
        }
        //TODO should really error per response in a Batch based on properties
        //    - could be done in a validation link
        if (
          !Array.isArray(result) &&
          !result.hasOwnProperty('data') &&
          !result.hasOwnProperty('errors')
        ) {
          //Data error
          throwServerError(
            response,
            result,
            `Server response was missing for query '${
              Array.isArray(operations)
                ? operations.map(op => op.operationName)
                : operations.operationName
            }'.`,
          );
        }
        return result;
      })
  );
};

export const createSignalIfSupported = () => {
  if (typeof AbortController === 'undefined')
    return { controller: false, signal: false };

  const controller = new AbortController();
  const signal = controller.signal;
  return { controller, signal };
};

export const selectHttpOptionsAndBody = (
  operation: Operation,
  fallbackConfig: HttpConfig,
  ...configs: Array<HttpConfig>
) => {
  let options: HttpConfig = {
    ...fallbackConfig.options,
    headers: fallbackConfig.headers,
    credentials: fallbackConfig.credentials,
  };
  let http: HttpQueryOptions = fallbackConfig.http;

  /*
   * use the rest of the configs to populate the options
   * configs later in the list will overwrite earlier fields
   */
  configs.forEach(config => {
    options = {
      ...options,
      ...config.options,
      headers: {
        ...options.headers,
        ...config.headers,
      },
    };
    if (config.credentials) options.credentials = config.credentials;

    http = {
      ...http,
      ...config.http,
    };
  });

  //The body depends on the http options
  const { operationName, extensions, variables, query } = operation;
  const body = { operationName, variables };

  if (http.includeExtensions) (body as any).extensions = extensions;

  // not sending the query (i.e persisted queries)
  if (http.includeQuery) (body as any).query = print(query);

  return {
    options,
    body,
  };
};

export const serializeFetchBody = body => {
  let serializedBody;
  try {
    serializedBody = JSON.stringify(body);
  } catch (e) {
    const parseError = new Error(
      `Network request failed. Payload is not serializable: ${e.message}`,
    ) as ClientParseError;
    parseError.parseError = e;
    throw parseError;
  }
  return serializedBody;
};

//selects "/graphql" by default
export const selectURI = (
  operation,
  fallbackURI?: string | ((Operation) => string),
) => {
  const context = operation.getContext();
  const contextURI = context.uri;

  if (contextURI) {
    return contextURI;
  } else if (typeof fallbackURI === 'function') {
    return fallbackURI(operation);
  } else {
    return (fallbackURI as string) || '/graphql';
  }
};