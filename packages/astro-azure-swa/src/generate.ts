export interface GenerateAzureSwaFilesOptions {
  distDir: URL;
  functionName: string;
}

export async function generateAzureSwaFiles(
  options: GenerateAzureSwaFilesOptions,
): Promise<void> {
  throw new Error(
    `generateAzureSwaFiles is not implemented for ${options.functionName}`,
  );
}
