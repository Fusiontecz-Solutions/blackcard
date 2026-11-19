import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ClaudePdfExtractionService } from "./claude-pdf-extraction.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true,
    }),
  ],
  providers: [ClaudePdfExtractionService],
  exports: [ClaudePdfExtractionService],
})
export class ClaudePdfExtractionModule {}
