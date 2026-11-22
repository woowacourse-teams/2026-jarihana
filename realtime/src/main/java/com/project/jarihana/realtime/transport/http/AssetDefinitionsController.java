package com.project.jarihana.realtime.transport.http;

import com.project.jarihana.realtime.layout.LayoutCatalog;
import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AssetDefinitionsController {
    private final LayoutCatalog catalog;

    public AssetDefinitionsController(LayoutCatalog catalog) {
        this.catalog = catalog;
    }

    @CrossOrigin(origins = "*")
    @GetMapping(path = "/ws/realtime", headers = "!Upgrade")
    public ResponseEntity<DefinitionsResponse> assetDefinitions() {
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(1)).cachePublic())
                .body(new DefinitionsResponse(true, catalog.assetDefinitions(), null));
    }

    public record DefinitionsResponse(boolean success, LayoutCatalog.AssetDefinitions data, String error) {}
}
