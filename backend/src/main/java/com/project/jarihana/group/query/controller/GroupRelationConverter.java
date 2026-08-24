package com.project.jarihana.group.query.controller;

import com.project.jarihana.group.query.GroupRelation;
import org.springframework.core.convert.converter.Converter;
import org.springframework.stereotype.Component;

import java.util.Locale;

@Component
public class GroupRelationConverter implements Converter<String, GroupRelation> {

    @Override
    public GroupRelation convert(String source) {
        return GroupRelation.valueOf(source.toUpperCase(Locale.ROOT));
    }
}
