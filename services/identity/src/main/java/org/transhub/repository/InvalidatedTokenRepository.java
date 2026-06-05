package org.transhub.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.transhub.entity.InvalidatedToken;


@Repository
public interface InvalidatedTokenRepository extends JpaRepository<InvalidatedToken, String> {}
