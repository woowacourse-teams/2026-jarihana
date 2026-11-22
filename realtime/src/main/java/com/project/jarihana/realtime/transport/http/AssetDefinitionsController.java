package com.project.jarihana.realtime.transport.http;

import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AssetDefinitionsController {
    @CrossOrigin(origins = "*")
    @GetMapping(path = "/ws/realtime", headers = "!Upgrade")
    public ResponseEntity<DefinitionsResponse> assetDefinitions() {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(1)).cachePublic())
                .body(new DefinitionsResponse(true, new CatalogContract(2), null));
    }

    public record CatalogContract(int catalogContractVersion) {}
    public record DefinitionsResponse(boolean success, CatalogContract data, String error) {}
}
