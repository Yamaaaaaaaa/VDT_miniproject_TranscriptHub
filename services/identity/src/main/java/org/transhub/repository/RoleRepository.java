package org.transhub.repository;


import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.transhub.entity.Role;


@Repository
public interface RoleRepository extends JpaRepository<Role, String> {
    Role findByName(String name);
}
